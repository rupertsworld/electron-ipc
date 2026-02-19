import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import * as electron from 'electron';

import { SERVICE_EXISTS_CHANNEL, serviceEventChannel, serviceInvokeChannel } from './channels.ts';
import { IPCService } from './ipc-service.ts';
import type { EventMap } from './types.ts';

type IpcMainLike = {
  handle(
    channel: string,
    handler: (event: unknown, methodName: string, args: readonly unknown[]) => Promise<unknown> | unknown,
  ): void;
  on(channel: string, listener: (event: { returnValue?: unknown }, serviceName: string) => void): void;
};

type EventBusLike = {
  broadcast(channel: string, payload: unknown): void;
};

type ServiceCtor<T> = new () => T;

const registeredServices = new Map<string, object>();
let serviceExistsListenerBound = false;

const RESERVED_METHOD_NAMES = new Set(['on', 'off', 'once', 'emit', 'setEmitHook', 'constructor']);

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function missingMethodError(serviceName: string, methodName: string): Error {
  return new Error(`[electron-ipc] Service "${serviceName}" has no callable method "${methodName}"`);
}

function methodCallError(serviceName: string, methodName: string, error: unknown): Error {
  return new Error(
    `[electron-ipc] Service "${serviceName}" method "${methodName}" failed: ${asError(error).message}`,
  );
}

function resolveDefaultDeps(): { ipcMain: IpcMainLike; eventBus: EventBusLike } {
  const runtime = electron as unknown as {
    ipcMain?: IpcMainLike;
    BrowserWindow?: { getAllWindows(): Array<{ webContents: { send(channel: string, payload: unknown): void } }> };
  };

  if (!runtime.ipcMain || !runtime.BrowserWindow) {
    throw new Error('[electron-ipc] Electron runtime unavailable. Pass deps in tests or run inside Electron main.');
  }

  return {
    ipcMain: runtime.ipcMain,
    eventBus: {
      broadcast(channel, payload) {
        for (const windowRef of runtime.BrowserWindow?.getAllWindows() ?? []) {
          windowRef.webContents.send(channel, payload);
        }
      },
    },
  };
}

export function exposeIPC<T extends object>(
  serviceOrCtor: T | ServiceCtor<T>,
  serviceName?: string,
  deps?: { ipcMain: IpcMainLike; eventBus: EventBusLike },
): void {
  const { ipcMain, eventBus } = deps ?? resolveDefaultDeps();

  const isCtor = typeof serviceOrCtor === 'function';
  const resolvedName = serviceName ?? (isCtor ? (serviceOrCtor as ServiceCtor<T>).name : serviceOrCtor.constructor.name);
  if (registeredServices.has(resolvedName)) {
    throw new Error(`[electron-ipc] Service "${resolvedName}" is already registered`);
  }

  const service = isCtor ? new (serviceOrCtor as ServiceCtor<T>)() : serviceOrCtor;
  registeredServices.set(resolvedName, service);

  if (service instanceof IPCService) {
    service.setEmitHook((eventName, payload) => {
      eventBus.broadcast(serviceEventChannel(resolvedName, String(eventName)), payload);
    });
  }

  ipcMain.handle(serviceInvokeChannel(resolvedName), async (_event, methodName, args) => {
    if (RESERVED_METHOD_NAMES.has(methodName)) {
      throw missingMethodError(resolvedName, methodName);
    }

    const candidate = (service as Record<string, unknown>)[methodName];
    if (typeof candidate !== 'function') {
      throw missingMethodError(resolvedName, methodName);
    }

    try {
      return await Promise.resolve((candidate as (...runtimeArgs: readonly unknown[]) => unknown).apply(service, [...args]));
    } catch (error) {
      throw methodCallError(resolvedName, methodName, error);
    }
  });

  if (!serviceExistsListenerBound) {
    ipcMain.on(SERVICE_EXISTS_CHANNEL, (event, requestedServiceName) => {
      event.returnValue = registeredServices.has(requestedServiceName);
    });
    serviceExistsListenerBound = true;
  }
}

export function getPreloadPath(): string {
  const attempts: string[] = [];
  const req = typeof require === 'function'
    ? require
    : createRequire(path.join(process.cwd(), '__electron_ipc_resolver__.cjs'));

  try {
    const mainEntry = req.resolve('@rupertsworld/electron-ipc');
    const sibling = path.join(path.dirname(mainEntry), 'preload.cjs');
    const parentSibling = path.resolve(path.dirname(mainEntry), '..', 'preload.cjs');
    if (path.basename(path.dirname(mainEntry)) === 'cjs') {
      attempts.push(parentSibling);
      if (existsSync(parentSibling)) {
        return parentSibling;
      }
    }
    attempts.push(sibling);
    if (existsSync(sibling)) {
      return sibling;
    }
  } catch {
    // Try local sibling fallback for source/test runtime.
  }

  const stackDir = inferModuleDirFromStack();
  if (stackDir) {
    const stackSibling = path.join(stackDir, 'preload.cjs');
    attempts.push(stackSibling);
    if (existsSync(stackSibling)) {
      return stackSibling;
    }
    const stackParentSibling = path.resolve(stackDir, '..', 'preload.cjs');
    attempts.push(stackParentSibling);
    if (existsSync(stackParentSibling)) {
      return stackParentSibling;
    }
  }

  const cwdSourceSibling = path.resolve(process.cwd(), 'src/preload.cjs');
  attempts.push(cwdSourceSibling);
  if (existsSync(cwdSourceSibling)) {
    return cwdSourceSibling;
  }

  throw new Error(
    `[electron-ipc] Preload path resolution failed. Tried: ${attempts.join(', ') || '(no candidates)'}`,
  );
}

function inferModuleDirFromStack(): string | undefined {
  const stack = new Error().stack ?? '';
  const lines = stack.split('\n');
  for (const line of lines) {
    const fileUrlMatch = line.match(/file:\/\/\/[^\s)]+/);
    if (fileUrlMatch) {
      try {
        const parsed = decodeURIComponent(fileUrlMatch[0].replace(/^file:\/\//, ''));
        return path.dirname(parsed);
      } catch {
        // Continue to other candidates.
      }
    }

    const pathMatch = line.match(/\((\/[^\s)]+):\d+:\d+\)/) ?? line.match(/at (\/[^\s)]+):\d+:\d+/);
    if (pathMatch?.[1]) {
      return path.dirname(pathMatch[1]);
    }
  }
  return undefined;
}

export function resetIPCRegistryForTests(): void {
  registeredServices.clear();
  serviceExistsListenerBound = false;
}

export { IPCService };
export type { EventMap };

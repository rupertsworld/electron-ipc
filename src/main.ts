import { SERVICE_EXISTS_CHANNEL, serviceEventChannel, serviceInvokeChannel } from './channels.ts';
import { requireElectron } from './electron-require.ts';
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
  broadcast(serviceName: string, eventName: string, payload: unknown): void;
};

type ServiceCtor<T> = new () => T;

const registeredServices = new Map<string, object>();
let serviceExistsListenerBound = false;
const RESERVED_METHOD_NAMES = new Set(['on', 'off', 'once', 'emit', 'setEmitHook', 'constructor']);

function resolveDefaultDeps(): { ipcMain: IpcMainLike; eventBus: EventBusLike } {
  const electron = requireElectron() as {
    ipcMain: IpcMainLike;
    BrowserWindow: { getAllWindows(): Array<{ webContents: { send(channel: string, payload: unknown): void } }> };
  };

  return {
    ipcMain: electron.ipcMain,
    eventBus: createInMemoryEventBus((channel, payload) => {
      for (const windowRef of electron.BrowserWindow.getAllWindows()) {
        windowRef.webContents.send(channel, payload);
      }
    }),
  };
}

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
  const original = asError(error);
  return new Error(`[electron-ipc] Service "${serviceName}" method "${methodName}" failed: ${original.message}`);
}

export function createIPCService<T extends object>(
  serviceName: string,
  serviceOrCtor: T | ServiceCtor<T>,
  deps?: { ipcMain: IpcMainLike; eventBus: EventBusLike },
): void {
  const resolvedDeps = deps ?? resolveDefaultDeps();

  if (registeredServices.has(serviceName)) {
    throw new Error(`[electron-ipc] Service "${serviceName}" is already registered`);
  }

  const service =
    typeof serviceOrCtor === 'function' ? new (serviceOrCtor as ServiceCtor<T>)() : (serviceOrCtor as T);
  registeredServices.set(serviceName, service);

  if (service instanceof IPCService) {
    service.setEmitHook((eventName, payload) => {
      resolvedDeps.eventBus.broadcast(serviceName, String(eventName), payload);
    });
  }

  resolvedDeps.ipcMain.handle(
    serviceInvokeChannel(serviceName),
    async (_event: unknown, methodName: string, args: readonly unknown[]) => {
      if (RESERVED_METHOD_NAMES.has(methodName)) {
        throw missingMethodError(serviceName, methodName);
      }
      const methodCandidate = (service as Record<string, unknown>)[methodName];
      if (typeof methodCandidate !== 'function') {
        throw missingMethodError(serviceName, methodName);
      }

      try {
        return await Promise.resolve(
          (methodCandidate as (...runtimeArgs: readonly unknown[]) => unknown).apply(service, [...args]),
        );
      } catch (error) {
        throw methodCallError(serviceName, methodName, error);
      }
    },
  );

  if (!serviceExistsListenerBound) {
    resolvedDeps.ipcMain.on(SERVICE_EXISTS_CHANNEL, (event, requestedServiceName) => {
      event.returnValue = registeredServices.has(requestedServiceName);
    });
    serviceExistsListenerBound = true;
  }
}

export function createInMemoryEventBus(
  send: (channel: string, payload: unknown) => void,
): EventBusLike {
  return {
    broadcast(serviceName, eventName, payload) {
      send(serviceEventChannel(serviceName, eventName), payload);
    },
  };
}

export function resetIPCServicesForTests(): void {
  registeredServices.clear();
  serviceExistsListenerBound = false;
}

export type { EventMap };

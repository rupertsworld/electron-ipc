import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  IPCService,
  enableIPC,
  exposeIPC,
  getPreloadPath,
  resetIPCRegistryForTests,
  resetRendererBridgeForTests,
  resolveIPC,
} from '../src/index.ts';

type GreetingEvents = {
  greeting: { text: string };
  status: { ok: boolean };
};

interface IMyService extends IPCService<GreetingEvents> {
  hello(name: string): string;
  sum(a: number, b: number): number;
  delayedEcho(value: string, delayMs: number): Promise<string>;
  explode(): void;
  weirdError(): void;
  nonCallable: string;
}

class MyService extends IPCService<GreetingEvents> implements IMyService {
  nonCallable = 'value';

  hello(name: string): string {
    const text = `Hello ${name}`;
    this.emit('greeting', { text });
    return text;
  }

  sum(a: number, b: number): number {
    return a + b;
  }

  async delayedEcho(value: string, delayMs: number): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return value;
  }

  explode(): void {
    throw new Error('boom');
  }

  weirdError(): void {
    throw 'plain-string-error';
  }

  emitStatus(ok: boolean): void {
    this.emit('status', { ok });
  }
}

type InvokeHandler = (event: unknown, methodName: string, args: readonly unknown[]) => Promise<unknown> | unknown;
type SyncListener = (event: { returnValue?: unknown }, serviceName: string) => void;
type RendererListener = (event: unknown, payload: unknown) => void;

function createBoundaryHarness() {
  const invokeHandlers = new Map<string, InvokeHandler>();
  const syncListeners = new Map<string, Set<SyncListener>>();
  const rendererListeners = new Map<string, Set<RendererListener>>();

  const ipcMain = {
    handle(channel: string, handler: InvokeHandler) {
      invokeHandlers.set(channel, handler);
    },
    on(channel: string, listener: SyncListener) {
      if (!syncListeners.has(channel)) {
        syncListeners.set(channel, new Set());
      }
      syncListeners.get(channel)?.add(listener);
    },
  };

  const ipcRenderer = {
    async invoke(channel: string, methodName: string, args: readonly unknown[]) {
      const handler = invokeHandlers.get(channel);
      if (!handler) {
        throw new Error(`No invoke handler for ${channel}`);
      }
      return await handler({}, methodName, args);
    },
    sendSync(channel: string, serviceName: string): boolean {
      const listeners = syncListeners.get(channel);
      if (!listeners || listeners.size === 0) {
        return false;
      }
      const event: { returnValue?: unknown } = { returnValue: false };
      for (const listener of listeners) {
        listener(event, serviceName);
      }
      return Boolean(event.returnValue);
    },
    on(channel: string, listener: RendererListener) {
      if (!rendererListeners.has(channel)) {
        rendererListeners.set(channel, new Set());
      }
      rendererListeners.get(channel)?.add(listener);
    },
    removeListener(channel: string, listener: RendererListener) {
      rendererListeners.get(channel)?.delete(listener);
    },
  };

  const contextBridge = {
    exposeInMainWorld(name: string, value: unknown) {
      (globalThis as Record<string, unknown>)[name] = value;
    },
  };

  const eventBus = {
    broadcast(channel: string, payload: unknown) {
      const listeners = rendererListeners.get(channel);
      if (!listeners) {
        return;
      }
      for (const listener of [...listeners]) {
        listener({}, payload);
      }
    },
  };

  return { ipcMain, ipcRenderer, contextBridge, eventBus };
}

describe('electron-ipc runtime behavior', () => {
  beforeEach(() => {
    resetIPCRegistryForTests();
    resetRendererBridgeForTests();
  });

  it('should fail predictably when renderer resolves a service before the bridge is enabled', () => {
    expect(() => resolveIPC<IMyService>('MyService')).toThrow(/enableIPC/i);
  });

  it('should return an absolute existing file path from getPreloadPath()', () => {
    const preloadPath = getPreloadPath();
    expect(path.isAbsolute(preloadPath)).toBe(true);
    expect(preloadPath.endsWith('preload.cjs')).toBe(true);
    expect(existsSync(preloadPath)).toBe(true);
  });

  it('should return the same preload path regardless of process cwd (including nested consumer directories)', () => {
    const originalCwd = process.cwd();
    const baseline = getPreloadPath();
    const exampleDir = path.resolve(originalCwd, 'example');

    try {
      process.chdir(exampleDir);
      const fromExampleCwd = getPreloadPath();
      expect(fromExampleCwd).toBe(baseline);
      expect(existsSync(fromExampleCwd)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should keep shipped preload wrapper free of node built-ins so it can run in sandboxed preload', () => {
    const preloadWrapperPath = path.resolve(process.cwd(), 'src/preload.cjs');
    const preloadWrapperCode = readFileSync(preloadWrapperPath, 'utf8');
    expect(preloadWrapperCode).not.toContain('node:fs');
    expect(preloadWrapperCode).not.toContain('node:path');
    expect(preloadWrapperCode).not.toContain('./cjs/bridge.cjs');
    expect(preloadWrapperCode).not.toContain('./bridge.cjs');

    let enabled = false;
    const sandbox = {
      require(id: string) {
        if (id === 'electron') {
          return {
            contextBridge: {
              exposeInMainWorld() {
                enabled = true;
              },
            },
            ipcRenderer: {
              invoke: async () => undefined,
              sendSync: () => true,
              on: () => undefined,
              removeListener: () => undefined,
            },
          };
        }
        throw new Error(`module not found: ${id}`);
      },
    };
    vm.runInNewContext(preloadWrapperCode, sandbox);
    expect(enabled).toBe(true);
  });

  it('should register a service class using its class name when no explicit name is provided', async () => {
    const harness = createBoundaryHarness();
    enableIPC({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });
    exposeIPC(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPC<IMyService>('MyService');
    await expect(service.hello('Bob')).resolves.toBe('Hello Bob');
  });

  it('should fail when registering the same service name more than once', () => {
    const harness = createBoundaryHarness();
    enableIPC({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });
    exposeIPC(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    expect(() => exposeIPC(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus })).toThrow(
      /already registered/i,
    );
  });

  it('should reject when calling a method name that does not exist on the registered service', async () => {
    const harness = createBoundaryHarness();
    enableIPC({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });
    exposeIPC(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPC<IMyService>('MyService') as unknown as Record<string, () => Promise<unknown>>;
    await expect(service.notAMethod()).rejects.toThrow(/callable method/i);
  });

  it('should emit events from main service methods and deliver typed payloads to renderer listeners', async () => {
    const harness = createBoundaryHarness();
    enableIPC({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });
    exposeIPC(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPC<IMyService>('MyService');
    const received: string[] = [];
    service.on('greeting', (payload) => received.push(payload.text));
    await service.hello('Alice');
    expect(received).toEqual(['Hello Alice']);
  });

  it('should continue delivering an event to remaining listeners when one listener throws', () => {
    const instance = new IPCService<{ ping: { ok: boolean } }>();
    const safe = vi.fn();
    instance.on('ping', () => {
      throw new Error('listener failed');
    });
    instance.on('ping', safe);

    instance.emit('ping', { ok: true });
    expect(safe).toHaveBeenCalledTimes(1);
  });
});

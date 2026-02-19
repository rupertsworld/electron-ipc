import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPCService } from '../src/ipc-service.ts';
import { createIPCService, createInMemoryEventBus, resetIPCServicesForTests } from '../src/main.ts';
import { enableIPCBridge } from '../src/preload.ts';
import { resetRendererBridgeForTests, resolveIPCService } from '../src/renderer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type GreetingEvents = {
  greeting: { text: string };
  status: { ok: boolean };
};

type OtherEvents = {
  notice: { value: number };
};

interface IMyService extends IPCService<GreetingEvents> {
  hello(name: string): string;
  sum(a: number, b: number): number;
  delayedEcho(value: string, delayMs: number): Promise<string>;
  explode(): void;
  weirdError(): void;
  nonCallable: string;
}

interface IOtherService extends IPCService<OtherEvents> {
  ping(value: number): number;
}

class MyService extends IPCService<GreetingEvents> implements IMyService {
  nonCallable = 'static-value';

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

class OtherService extends IPCService<OtherEvents> implements IOtherService {
  ping(value: number): number {
    this.emit('notice', { value });
    return value;
  }
}

type InvokeHandler = (event: unknown, methodName: string, args: readonly unknown[]) => Promise<unknown> | unknown;
type SyncListener = (event: { returnValue?: unknown }, serviceName: string) => void;
type RendererListener = (event: unknown, payload: unknown) => void;

function createBoundaryHarness() {
  const invokeHandlers = new Map<string, InvokeHandler>();
  const syncListeners = new Map<string, Set<SyncListener>>();
  const rendererListeners = new Map<string, Set<RendererListener>>();
  const windowValues = new Map<string, unknown>();

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
      windowValues.set(name, value);
      (globalThis as Record<string, unknown>)[name] = value;
    },
  };

  const eventBus = createInMemoryEventBus((channel, payload) => {
    const listeners = rendererListeners.get(channel);
    if (!listeners) {
      return;
    }
    for (const listener of [...listeners]) {
      listener({}, payload);
    }
  });

  return { ipcMain, ipcRenderer, contextBridge, eventBus, windowValues };
}

function setupBridgeAndServices() {
  const harness = createBoundaryHarness();
  enableIPCBridge({
    contextBridge: harness.contextBridge,
    ipcRenderer: harness.ipcRenderer,
  });
  return harness;
}

describe('electron-ipc', () => {
  beforeEach(() => {
    resetIPCServicesForTests();
    resetRendererBridgeForTests();
  });

  it('should expose bridge APIs to renderer only after enableIPCBridge() is executed in preload', () => {
    expect(() => resolveIPCService<IMyService>('MyService')).toThrow(/bridge is not enabled/i);

    const harness = createBoundaryHarness();
    enableIPCBridge({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });

    expect((globalThis as Record<string, unknown>).ipcServiceBridge).toBeTruthy();
  });

  it('should fail predictably when renderer resolves a service before the preload bridge is enabled', () => {
    expect(() => resolveIPCService<IMyService>('MyService')).toThrow(/enableIPCBridge/i);
  });

  it('should register a service class using its class name when no explicit name is provided', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.hello('Bob')).resolves.toBe('Hello Bob');
  });

  it('should register a service class under a custom name when one is provided', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, 'Custom', { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('Custom');
    await expect(service.hello('Bob')).resolves.toBe('Hello Bob');
  });

  it('should register an already-created instance using its constructor name when no explicit name is provided', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(new MyService(), undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.hello('Bob')).resolves.toBe('Hello Bob');
  });

  it('should register an already-created instance under a custom name when one is provided', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(new MyService(), 'CustomInstance', { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('CustomInstance');
    await expect(service.hello('Bob')).resolves.toBe('Hello Bob');
  });

  it('should allow renderer service resolution after preload bridge is enabled', async () => {
    const harness = createBoundaryHarness();
    enableIPCBridge({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer });
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.sum(2, 3)).resolves.toBe(5);
  });

  it('should fail when registering the same service name more than once', () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    expect(() =>
      createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus }),
    ).toThrow(/already registered/i);
  });

  it('should allow registering multiple distinct service names in the same process', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });
    createIPCService(OtherService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const my = resolveIPCService<IMyService>('MyService');
    const other = resolveIPCService<IOtherService>('OtherService');

    await expect(my.sum(1, 2)).resolves.toBe(3);
    await expect(other.ping(9)).resolves.toBe(9);
  });

  it('should resolve a service registered with default class name', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.sum(2, 3)).resolves.toBe(5);
  });

  it('should resolve a service registered with a custom name using that custom name', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, 'Aliased', { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('Aliased');
    await expect(service.sum(10, 20)).resolves.toBe(30);
  });

  it('should fail immediately when resolving a service name that is not registered', () => {
    setupBridgeAndServices();
    expect(() => resolveIPCService<IMyService>('MissingService')).toThrow(/not registered/i);
  });

  it('should fail when resolving by class name if the service was registered with a custom name', () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, 'NotMyService', { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    expect(() => resolveIPCService<IMyService>('MyService')).toThrow(/not registered/i);
  });

  it('should allow resolving the same registered service name from multiple renderer call sites', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const first = resolveIPCService<IMyService>('MyService');
    const second = resolveIPCService<IMyService>('MyService');

    await expect(first.sum(3, 4)).resolves.toBe(7);
    await expect(second.sum(5, 6)).resolves.toBe(11);
  });

  it('should pass method arguments from renderer to main in the original order', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.sum(11, 7)).resolves.toBe(18);
  });

  it('should invoke registered service methods from renderer and complete asynchronously', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });
    const service = resolveIPCService<IMyService>('MyService');

    const promise = service.sum(1, 1);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).resolves.toBe(2);
  });

  it('should return method results from main to renderer correctly across IPC', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.hello('Rupert')).resolves.toBe('Hello Rupert');
  });

  it('should reject when calling a method name that does not exist on the registered service', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService') as unknown as Record<
      string,
      (...args: readonly unknown[]) => Promise<unknown>
    >;
    await expect(service.notAMethod()).rejects.toThrow(/no callable method/i);
  });

  it('should reject when calling reserved framework method names as service methods', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService') as unknown as Record<
      string,
      (...args: readonly unknown[]) => Promise<unknown>
    >;
    for (const reserved of ['emit', 'setEmitHook', 'constructor']) {
      await expect(service[reserved]()).rejects.toThrow(/no callable method/i);
    }
  });

  it('should include service and method context in missing-method rejection errors', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService') as unknown as Record<
      string,
      (...args: readonly unknown[]) => Promise<unknown>
    >;
    await expect(service.notAMethod()).rejects.toThrow(/MyService/);
    await expect(service.notAMethod()).rejects.toThrow(/notAMethod/);
  });

  it('should reject when attempting to invoke a non-callable member name on the registered service', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService') as unknown as Record<
      string,
      (...args: readonly unknown[]) => Promise<unknown>
    >;
    await expect(service.nonCallable()).rejects.toThrow(/no callable method/i);
  });

  it('should propagate thrown method errors from main to renderer with original error message when feasible', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.explode()).rejects.toThrow(/boom/);
    await expect(service.explode()).rejects.toThrow(/MyService/);
    await expect(service.explode()).rejects.toThrow(/explode/);
  });

  it('should provide deterministic fallback error text with service and method context when full error transport is not feasible', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    await expect(service.weirdError()).rejects.toThrow(/MyService/);
    await expect(service.weirdError()).rejects.toThrow(/weirdError/);
  });

  it('should emit events from main service methods and deliver typed payloads to renderer listeners', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    const received: string[] = [];
    service.on('greeting', (payload) => {
      received.push(payload.text);
    });

    await service.hello('Alice');
    expect(received).toEqual(['Hello Alice']);
  });

  it('should deliver the same emitted event to all listeners currently attached for that event', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    service.on('greeting', (payload) => receivedA.push(payload.text));
    service.on('greeting', (payload) => receivedB.push(payload.text));

    await service.hello('Tom');

    expect(receivedA).toEqual(['Hello Tom']);
    expect(receivedB).toEqual(['Hello Tom']);
  });

  it('should invoke a once listener exactly once across multiple emissions of the same event', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    const listener = vi.fn();
    service.once('greeting', listener);

    await service.hello('A');
    await service.hello('B');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should remove a listener with off(event, listener) so it does not receive future emissions', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    const received: string[] = [];
    const listener = (payload: { text: string }) => received.push(payload.text);
    service.on('greeting', listener);
    service.off('greeting', listener);

    await service.hello('John');
    expect(received).toEqual([]);
  });

  it('should treat off(event, listener) as a silent no-op when the listener is not currently registered', () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const service = resolveIPCService<IMyService>('MyService');
    expect(() => service.off('greeting', () => undefined)).not.toThrow();
  });

  it('should drop events emitted before listeners are attached (no replay)', async () => {
    const harness = setupBridgeAndServices();
    const instance = new MyService();
    createIPCService(instance, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    instance.emit('greeting', { text: 'before' });
    const received: string[] = [];
    const service = resolveIPCService<IMyService>('MyService');
    service.on('greeting', (payload) => received.push(payload.text));
    instance.emit('greeting', { text: 'after' });

    expect(received).toEqual(['after']);
  });

  it('should continue delivering an event to remaining listeners when one listener throws', async () => {
    const harness = setupBridgeAndServices();
    const instance = new MyService();
    createIPCService(instance, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });
    const service = resolveIPCService<IMyService>('MyService');

    const safe = vi.fn();
    service.on('status', () => {
      throw new Error('listener failure');
    });
    service.on('status', safe);

    instance.emitStatus(true);
    expect(safe).toHaveBeenCalledTimes(1);
  });

  it("should keep service channels isolated so one service's calls and events do not cross into another service", async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });
    createIPCService(OtherService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });

    const my = resolveIPCService<IMyService>('MyService');
    const other = resolveIPCService<IOtherService>('OtherService');

    const myEvents: string[] = [];
    const otherEvents: number[] = [];
    my.on('greeting', (payload) => myEvents.push(payload.text));
    other.on('notice', (payload) => otherEvents.push(payload.value));

    await my.hello('Corey');
    await other.ping(5);

    expect(myEvents).toEqual(['Hello Corey']);
    expect(otherEvents).toEqual([5]);
  });

  it('should handle parallel in-flight calls without mixing responses between call sites', async () => {
    const harness = setupBridgeAndServices();
    createIPCService(MyService, undefined, { ipcMain: harness.ipcMain, eventBus: harness.eventBus });
    const service = resolveIPCService<IMyService>('MyService');

    const [first, second, third] = await Promise.all([
      service.delayedEcho('first', 15),
      service.delayedEcho('second', 5),
      service.delayedEcho('third', 1),
    ]);

    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(third).toBe('third');
  });

  it('should produce no warnings when bundled to CJS with esbuild', async () => {
    const entryPoint = path.resolve(__dirname, '../src/index.ts');
    const result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      write: false,
      external: ['electron'],
      logLevel: 'silent',
    });

    const warnings = result.warnings.map((w) => w.text);
    expect(warnings).toEqual([]);
  });
});

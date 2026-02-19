import type { IPCBridgeAPI } from './bridge.ts';
import type { AsyncService } from './types.ts';

const BRIDGE_KEY = 'ipcServiceBridge';
type AnyListener = (payload: unknown) => void;

function getBridge(): IPCBridgeAPI {
  const bridge = (globalThis as Record<string, unknown>)[BRIDGE_KEY] as IPCBridgeAPI | undefined;
  if (!bridge) {
    throw new Error('[electron-ipc] IPC bridge is not enabled. Call enableIPC() in preload first.');
  }
  return bridge;
}

function normalizeInvokeError(serviceName: string, methodName: string, error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.includes(serviceName) && error.message.includes(methodName)) {
      return error;
    }
    return new Error(`[electron-ipc] Service "${serviceName}" method "${methodName}" failed: ${error.message}`);
  }
  return new Error(`[electron-ipc] Service "${serviceName}" method "${methodName}" failed: ${String(error)}`);
}

export function resolveIPC<T extends object>(serviceName: string): AsyncService<T> {
  const bridge = getBridge();
  if (!bridge.hasService(serviceName)) {
    throw new Error(`[electron-ipc] Service "${serviceName}" is not registered`);
  }

  const listenersByEvent = new Map<string, Set<AnyListener>>();
  const unsubscribeByEvent = new Map<string, () => void>();

  const ensureRemoteSubscription = (eventName: string): void => {
    if (unsubscribeByEvent.has(eventName)) {
      return;
    }
    const unsubscribe = bridge.on(serviceName, eventName, (payload) => {
      const listeners = listenersByEvent.get(eventName);
      if (!listeners) {
        return;
      }
      for (const listener of [...listeners]) {
        try {
          listener(payload);
        } catch {
          // Listener failures should not prevent delivery to remaining listeners.
        }
      }
    });
    unsubscribeByEvent.set(eventName, unsubscribe);
  };

  const api = new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (typeof property !== 'string') {
          return undefined;
        }

        if (property === 'on') {
          return (eventName: string, listener: AnyListener) => {
            if (!listenersByEvent.has(eventName)) {
              listenersByEvent.set(eventName, new Set());
            }
            listenersByEvent.get(eventName)?.add(listener);
            ensureRemoteSubscription(eventName);
            return api;
          };
        }

        if (property === 'once') {
          return (eventName: string, listener: AnyListener) => {
            const onceListener: AnyListener = (payload) => {
              (api as Record<string, (...args: unknown[]) => unknown>).off(eventName, onceListener);
              listener(payload);
            };
            (api as Record<string, (...args: unknown[]) => unknown>).on(eventName, onceListener);
            return api;
          };
        }

        if (property === 'off') {
          return (eventName: string, listener: AnyListener) => {
            const listeners = listenersByEvent.get(eventName);
            if (!listeners) {
              return api;
            }
            listeners.delete(listener);
            if (listeners.size === 0) {
              listenersByEvent.delete(eventName);
              const unsubscribe = unsubscribeByEvent.get(eventName);
              unsubscribeByEvent.delete(eventName);
              unsubscribe?.();
            }
            return api;
          };
        }

        return async (...args: readonly unknown[]) => {
          try {
            return await bridge.invoke(serviceName, property, args);
          } catch (error) {
            throw normalizeInvokeError(serviceName, property, error);
          }
        };
      },
    },
  );

  return api as AsyncService<T>;
}

export function resetRendererBridgeForTests(): void {
  delete (globalThis as Record<string, unknown>)[BRIDGE_KEY];
}

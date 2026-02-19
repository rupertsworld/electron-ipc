import * as electron from 'electron';

import { SERVICE_EXISTS_CHANNEL, serviceEventChannel, serviceInvokeChannel } from './channels.ts';

type IpcRendererLike = {
  invoke(channel: string, methodName: string, args: readonly unknown[]): Promise<unknown>;
  sendSync(channel: string, serviceName: string): boolean;
  on(channel: string, listener: (_event: unknown, payload: unknown) => void): void;
  removeListener(channel: string, listener: (_event: unknown, payload: unknown) => void): void;
};

type ContextBridgeLike = {
  exposeInMainWorld(name: string, api: unknown): void;
};

export type IPCBridgeAPI = {
  invoke(serviceName: string, methodName: string, args: readonly unknown[]): Promise<unknown>;
  hasService(serviceName: string): boolean;
  on(serviceName: string, eventName: string, callback: (payload: unknown) => void): () => void;
};

const BRIDGE_KEY = 'ipcServiceBridge';

function resolveDefaultDeps(): { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike } {
  const importedRuntime = electron as unknown as {
    contextBridge?: ContextBridgeLike;
    ipcRenderer?: IpcRendererLike;
  };

  if (importedRuntime.contextBridge && importedRuntime.ipcRenderer) {
    return {
      contextBridge: importedRuntime.contextBridge,
      ipcRenderer: importedRuntime.ipcRenderer,
    };
  }

  const runtimeFromRequire = resolveRuntimeFromGlobalRequire();
  if (runtimeFromRequire) {
    return runtimeFromRequire;
  }

  throw new Error('[electron-ipc] Electron preload runtime unavailable. Pass deps in tests or run in preload.');
}

function resolveRuntimeFromGlobalRequire():
  | { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike }
  | undefined {
  const globalRequire = (globalThis as { require?: (id: string) => unknown }).require;
  if (typeof globalRequire !== 'function') {
    return undefined;
  }

  const electronRendererRuntime = tryReadRuntime(globalRequire, 'electron/renderer');
  if (electronRendererRuntime) {
    return electronRendererRuntime;
  }

  const electronRuntime = tryReadRuntime(globalRequire, 'electron');
  if (electronRuntime) {
    return electronRuntime;
  }

  return undefined;
}

function tryReadRuntime(
  req: (id: string) => unknown,
  moduleId: string,
): { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike } | undefined {
  try {
    const runtime = req(moduleId) as {
      contextBridge?: ContextBridgeLike;
      ipcRenderer?: IpcRendererLike;
    };
    if (runtime.contextBridge && runtime.ipcRenderer) {
      return {
        contextBridge: runtime.contextBridge,
        ipcRenderer: runtime.ipcRenderer,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function enableIPC(
  deps?: { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike },
): IPCBridgeAPI {
  const { contextBridge, ipcRenderer } = deps ?? resolveDefaultDeps();

  const bridge: IPCBridgeAPI = {
    invoke(serviceName, methodName, args) {
      return ipcRenderer.invoke(serviceInvokeChannel(serviceName), methodName, args);
    },
    hasService(serviceName) {
      return Boolean(ipcRenderer.sendSync(SERVICE_EXISTS_CHANNEL, serviceName));
    },
    on(serviceName, eventName, callback) {
      const channel = serviceEventChannel(serviceName, eventName);
      const listener = (_event: unknown, payload: unknown) => {
        callback(payload);
      };
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
  };

  contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
  return bridge;
}

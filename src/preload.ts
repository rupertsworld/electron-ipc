import { SERVICE_EXISTS_CHANNEL, serviceEventChannel, serviceInvokeChannel } from './channels.ts';
import { requireElectron } from './electron-require.ts';

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

export function enableIPCBridge(
  deps?: { contextBridge: ContextBridgeLike; ipcRenderer: IpcRendererLike },
): IPCBridgeAPI {
  const createBridge = (contextBridge: ContextBridgeLike, ipcRenderer: IpcRendererLike): IPCBridgeAPI => {
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
  };

  if (deps) {
    return createBridge(deps.contextBridge, deps.ipcRenderer);
  }

  const electron = requireElectron() as {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
  };
  return createBridge(electron.contextBridge, electron.ipcRenderer);
}

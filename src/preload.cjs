'use strict';

const IPC_NAMESPACE = 'electron-ipc';
const SERVICE_EXISTS_CHANNEL = `${IPC_NAMESPACE}:service:exists`;
const BRIDGE_KEY = 'ipcServiceBridge';

const serviceInvokeChannel = (serviceName) => `${IPC_NAMESPACE}:service:${serviceName}:invoke`;
const serviceEventChannel = (serviceName, eventName) => `${IPC_NAMESPACE}:service:${serviceName}:event:${eventName}`;

function loadRuntimeCandidate(moduleId) {
  try {
    const candidate = require(moduleId);
    if (candidate && candidate.contextBridge && candidate.ipcRenderer) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

const runtime = loadRuntimeCandidate('electron') || loadRuntimeCandidate('electron/renderer');
if (!runtime) {
  throw new Error('[electron-ipc] Unable to resolve preload runtime with contextBridge and ipcRenderer');
}

const bridge = {
  invoke(serviceName, methodName, args) {
    return runtime.ipcRenderer.invoke(serviceInvokeChannel(serviceName), methodName, args);
  },
  hasService(serviceName) {
    return Boolean(runtime.ipcRenderer.sendSync(SERVICE_EXISTS_CHANNEL, serviceName));
  },
  on(serviceName, eventName, callback) {
    const channel = serviceEventChannel(serviceName, eventName);
    const listener = (_event, payload) => callback(payload);
    runtime.ipcRenderer.on(channel, listener);
    return () => runtime.ipcRenderer.removeListener(channel, listener);
  },
};

runtime.contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);

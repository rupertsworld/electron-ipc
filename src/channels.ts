export const IPC_NAMESPACE = 'electron-ipc';
export const SERVICE_EXISTS_CHANNEL = `${IPC_NAMESPACE}:service:exists`;

export function serviceInvokeChannel(serviceName: string): string {
  return `${IPC_NAMESPACE}:service:${serviceName}:invoke`;
}

export function serviceEventChannel(serviceName: string, eventName: string): string {
  return `${IPC_NAMESPACE}:service:${serviceName}:event:${eventName}`;
}

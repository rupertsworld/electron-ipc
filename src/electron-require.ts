export function requireElectron(): Record<string, unknown> {
  // Electron's main and preload contexts always have a global require.
  // Avoid createRequire(import.meta.url) which breaks when bundled to CJS.
  const req = (globalThis as Record<string, unknown>).require as
    | ((id: string) => Record<string, unknown>)
    | undefined;
  if (!req) {
    throw new Error('[electron-ipc] require is not available — this module must run inside Electron');
  }
  return req('electron');
}

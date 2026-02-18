const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const { app, BrowserWindow } = require('electron');
  app.commandLine.appendSwitch('noerrdialogs');
  app.disableHardwareAcceleration();

  const builtIndex = pathToFileURL(path.resolve(__dirname, '../../.tmp/dist/index.js')).href;
  const { IPCService, createIPCService } = await import(builtIndex);

  class MyService extends IPCService {
    constructor() {
      super();
      this.nonCallable = 'value';
    }

    hello(name) {
      const text = `Hello ${name}`;
      this.emit('greeting', { text });
      return text;
    }

    emitGreeting(text) {
      this.emit('greeting', { text });
      return true;
    }

    explode() {
      throw new Error('boom');
    }

    delayedEcho(value, delayMs) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(value), delayMs);
      });
    }
  }

  class OtherService extends IPCService {
    ping(value) {
      this.emit('notice', { value });
      return value;
    }
  }

  await app.whenReady();

  createIPCService('MyService', MyService);
  createIPCService('OtherService', OtherService);
  let duplicateRegistrationError = '';
  try {
    createIPCService('MyService', MyService);
  } catch (error) {
    duplicateRegistrationError = error instanceof Error ? error.message : String(error);
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, './preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadURL('data:text/html,<html><body>electron-ipc-e2e</body></html>');

  const rendererResult = await win.webContents.executeJavaScript('window.__electronIpcE2E.run()');
  const merged = {
    ...rendererResult,
    duplicateRegistrationError,
  };

  process.stdout.write(`__ELECTRON_E2E_RESULT__${JSON.stringify(merged)}\n`);
  await app.quit();
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`__ELECTRON_E2E_ERROR__${message}\n`);
  process.exit(1);
});

const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadLibrary(target) {
  if (target === 'unbundled-cjs' || target === 'bundled-cjs' || target === 'custom-preload') {
    return require(path.resolve(__dirname, '../../../dist/cjs/index.cjs'));
  }
  const builtIndex = pathToFileURL(path.resolve(__dirname, '../../../dist/index.js')).href;
  return import(builtIndex);
}

async function main() {
  const { app, BrowserWindow } = require('electron');
  app.commandLine.appendSwitch('noerrdialogs');
  app.disableHardwareAcceleration();

  const target = process.env.ELECTRON_TARGET || 'unbundled-esm';
  const { IPCService, exposeIPC, getPreloadPath } = await loadLibrary(target);

  class MyService extends IPCService {
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
      return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
    }
  }

  await app.whenReady();
  exposeIPC(MyService);

  const preloadPath = target === 'custom-preload' ? path.resolve(__dirname, './preload.custom.cjs') : getPreloadPath();

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: target !== 'custom-preload',
    },
  });

  await win.loadURL('data:text/html,<html><body>electron-ipc-e2e</body></html>');
  const rendererResult = await win.webContents.executeJavaScript(`
    (async () => {
      const target = ${JSON.stringify(target)};
      const bridge = window.ipcServiceBridge;
      if (!bridge) {
        throw new Error('bridge missing in renderer');
      }

      const greetingEvents = [];
      const unlisten = bridge.on('MyService', 'greeting', (payload) => greetingEvents.push(payload.text));
      const greetingResult = await bridge.invoke('MyService', 'hello', ['E2E']);
      unlisten();

      let explodeError = '';
      try {
        await bridge.invoke('MyService', 'explode', []);
      } catch (error) {
        explodeError = error instanceof Error ? error.message : String(error);
      }

      const parallel = await Promise.all([
        bridge.invoke('MyService', 'delayedEcho', ['first', 20]),
        bridge.invoke('MyService', 'delayedEcho', ['second', 5]),
        bridge.invoke('MyService', 'delayedEcho', ['third', 1]),
      ]);

      await bridge.invoke('MyService', 'emitGreeting', ['before']);
      let payloadShape = null;
      const unlistenOnce = bridge.on('MyService', 'greeting', (payload) => {
        payloadShape = payload;
      });
      await bridge.invoke('MyService', 'emitGreeting', ['after']);
      unlistenOnce();

      return {
        greetingResult,
        greetingEvents,
        explodeError,
        parallel,
        payloadShape,
        sandboxEnabled: target !== 'custom-preload',
      };
    })();
  `);
  process.stdout.write(`__ELECTRON_E2E_RESULT__${JSON.stringify(rendererResult)}\n`);
  await app.quit();
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`__ELECTRON_E2E_ERROR__${message}\n`);
  process.exit(1);
});

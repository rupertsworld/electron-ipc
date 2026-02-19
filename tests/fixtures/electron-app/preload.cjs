const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { contextBridge } = require('electron');

function waitForTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function setup() {
  const target = process.env.ELECTRON_TARGET || 'unbundled-esm';
  let mod;
  if (target === 'unbundled-cjs' || target === 'bundled-cjs') {
    mod = require(path.resolve(__dirname, '../../../dist/cjs/index.cjs'));
  } else {
    const builtIndex = pathToFileURL(path.resolve(__dirname, '../../../dist/index.js')).href;
    mod = await import(builtIndex);
  }

  const { enableIPC, resolveIPC } = mod;
  const bridge = enableIPC();
  globalThis.ipcServiceBridge = bridge;

  contextBridge.exposeInMainWorld('__electronIpcE2E', {
    async run() {
      const service = resolveIPC('MyService');
      const greetingEvents = [];
      service.on('greeting', (payload) => greetingEvents.push(payload.text));
      const greetingResult = await service.hello('E2E');

      let explodeError = '';
      try {
        await service.explode();
      } catch (error) {
        explodeError = error instanceof Error ? error.message : String(error);
      }

      const parallel = await Promise.all([
        service.delayedEcho('first', 20),
        service.delayedEcho('second', 5),
        service.delayedEcho('third', 1),
      ]);

      await service.emitGreeting('before');
      let payloadShape = null;
      service.once('greeting', (payload) => {
        payloadShape = payload;
      });
      await service.emitGreeting('after');
      await waitForTick();

      return {
        greetingResult,
        greetingEvents,
        explodeError,
        parallel,
        payloadShape,
      };
    },
  });
}

setup().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`__ELECTRON_E2E_PRELOAD_ERROR__${message}\n`);
});

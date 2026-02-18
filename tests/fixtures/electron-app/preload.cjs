const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { contextBridge } = require('electron');

function waitForTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function setup() {
  const builtIndex = pathToFileURL(path.resolve(__dirname, '../../.tmp/dist/index.js')).href;
  const { enableIPCBridge, resolveIPCService } = await import(builtIndex);

  const bridge = enableIPCBridge();
  globalThis.ipcServiceBridge = bridge;

  contextBridge.exposeInMainWorld('__electronIpcE2E', {
    async run() {
      const service = resolveIPCService('MyService');
      const other = resolveIPCService('OtherService');

      const greetingEvents = [];
      const greetingListener = (payload) => greetingEvents.push(payload.text);
      service.on('greeting', greetingListener);
      const greetingResult = await service.hello('E2E');
      service.off('greeting', greetingListener);

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

      let unregisteredResolveError = '';
      try {
        resolveIPCService('NotRegistered');
      } catch (error) {
        unregisteredResolveError = error instanceof Error ? error.message : String(error);
      }

      await service.emitGreeting('before');
      const preListenerReplay = [];
      const preReplayListener = (payload) => preListenerReplay.push(payload.text);
      service.on('greeting', preReplayListener);
      await service.emitGreeting('after');
      await waitForTick();
      service.off('greeting', preReplayListener);

      let payloadShape = null;
      service.once('greeting', (payload) => {
        payloadShape = payload;
      });
      await service.emitGreeting('after');
      await waitForTick();

      const myServiceEvents = [];
      const otherServiceEvents = [];
      service.on('greeting', (payload) => myServiceEvents.push(payload.text));
      other.on('notice', (payload) => otherServiceEvents.push(payload.value));
      await service.hello('One');
      await other.ping(7);
      await waitForTick();

      return {
        greetingResult,
        greetingEvents,
        explodeError,
        parallel,
        unregisteredResolveError,
        preListenerReplay,
        payloadShape,
        myServiceEvents,
        otherServiceEvents,
      };
    },
  });
}

setup().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`__ELECTRON_E2E_PRELOAD_ERROR__${message}\n`);
});

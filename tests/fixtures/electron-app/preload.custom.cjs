const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function setup() {
  const target = process.env.ELECTRON_TARGET || 'custom-preload';
  if (target === 'custom-preload' || target === 'bundled-cjs' || target === 'unbundled-cjs') {
    const lib = require(path.resolve(__dirname, '../../../dist/cjs/index.cjs'));
    lib.enableIPC();
    return;
  }

  const builtIndex = pathToFileURL(path.resolve(__dirname, '../../../dist/index.js')).href;
  const lib = await import(builtIndex);
  lib.enableIPC();
}

setup().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`__ELECTRON_E2E_CUSTOM_PRELOAD_ERROR__${message}\n`);
});

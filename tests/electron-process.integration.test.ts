import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const runElectronE2E = process.env.ELECTRON_E2E === '1';

function ensureE2EBuild(): void {
  const run = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(`Failed building package for integration runtime.\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  }
}

function runElectronFixture(target: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ensureE2EBuild();

    const require = createRequire(import.meta.url);
    const electronBinary = require('electron') as string;
    const fixtureAppDir = path.resolve(__dirname, './fixtures/electron-app');
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ELECTRON_TARGET: target };
    delete childEnv.ELECTRON_RUN_AS_NODE;

    const child = spawn(electronBinary, [fixtureAppDir], {
      cwd: projectRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const resultLine = stdout.split('\n').find((line) => line.startsWith('__ELECTRON_E2E_RESULT__'));

      if (code !== 0 || !resultLine) {
        reject(new Error(`Electron fixture failed.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }

      resolve(JSON.parse(resultLine.slice('__ELECTRON_E2E_RESULT__'.length)) as Record<string, unknown>);
    });
  });
}

async function expectTargetPasses(target: string): Promise<void> {
  const result = await runElectronFixture(target);
  expect(result.greetingResult).toBe('Hello E2E');
  expect(result.parallel).toEqual(['first', 'second', 'third']);
  expect(result.greetingEvents).toEqual(['Hello E2E']);
  expect(result.payloadShape).toEqual({ text: 'after' });
  expect(result.sandboxEnabled).toBe(target !== 'custom-preload');
}

(runElectronE2E ? describe : describe.skip)('electron process integration', () => {
  let defaultTargetResult: Record<string, unknown>;

  beforeAll(async () => {
    defaultTargetResult = await runElectronFixture('unbundled-esm');
  }, 30000);

  it('should perform end-to-end service invocation across preload, renderer, and main using real Electron IPC transport', () => {
    expect(defaultTargetResult.greetingResult).toBe('Hello E2E');
  });

  it('should perform end-to-end event delivery from main service emit(...) to renderer on(...) listener across real Electron IPC transport', () => {
    expect(defaultTargetResult.greetingEvents).toEqual(['Hello E2E']);
  });

  it('should pass in required target: non-bundled + ESM main process using getPreloadPath()', async () => {
    await expectTargetPasses('unbundled-esm');
  });

  it('should pass in required target: non-bundled + CommonJS main process using getPreloadPath()', async () => {
    await expectTargetPasses('unbundled-cjs');
  });

  it('should pass in required target: bundled + ESM output main process with dependencies externalized and getPreloadPath()', async () => {
    await expectTargetPasses('bundled-esm');
  });

  it('should pass in required target: bundled + CommonJS output main process with dependencies externalized and getPreloadPath()', async () => {
    await expectTargetPasses('bundled-cjs');
  });

  it('should pass in required target: custom preload fallback using enableIPC() in non-standard bundling setups', async () => {
    await expectTargetPasses('custom-preload');
  });

  it('should run required targets with BrowserWindow sandbox enabled', async () => {
    await expectTargetPasses('unbundled-esm');
    await expectTargetPasses('unbundled-cjs');
    await expectTargetPasses('bundled-esm');
    await expectTargetPasses('bundled-cjs');
  });

});

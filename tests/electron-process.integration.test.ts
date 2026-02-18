import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const e2eTmpDir = path.resolve(__dirname, './.tmp');
const runElectronE2E = process.env.ELECTRON_E2E === '1';

function ensureE2EBuild(): void {
  rmSync(e2eTmpDir, { recursive: true, force: true });

  const tsconfigPath = path.resolve(__dirname, './fixtures/tsconfig.e2e.json');
  const bin = path.resolve(projectRoot, './node_modules/.bin/tsc');
  const run = spawnSync(bin, ['-p', tsconfigPath], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (run.status !== 0) {
    throw new Error(
      `Failed to build E2E runtime JS.\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
    );
  }
}

function cleanupE2EBuild(): void {
  rmSync(e2eTmpDir, { recursive: true, force: true });
}

function runElectronFixture(): Promise<{
  result: Record<string, unknown>;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    ensureE2EBuild();

    const require = createRequire(import.meta.url);
    const electronBinary = require('electron') as string;
    const fixtureAppDir = path.resolve(__dirname, './fixtures/electron-app');
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '0',
    };
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
      cleanupE2EBuild();
      reject(error);
    });
    child.on('close', (code) => {
      const resultLine = stdout
        .split('\n')
        .find((line) => line.startsWith('__ELECTRON_E2E_RESULT__'));

      if (code !== 0) {
        cleanupE2EBuild();
        reject(
          new Error(
            `Electron fixture exited with code ${code}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
          ),
        );
        return;
      }

      if (!resultLine) {
        cleanupE2EBuild();
        reject(new Error(`Missing result marker from Electron fixture.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }

      const json = resultLine.slice('__ELECTRON_E2E_RESULT__'.length);
      cleanupE2EBuild();
      resolve({
        result: JSON.parse(json) as Record<string, unknown>,
        stdout,
        stderr,
      });
    });
  });
}

(runElectronE2E ? describe : describe.skip)('electron process integration', () => {
  let sharedResult: Record<string, unknown>;

  beforeAll(async () => {
    const { result } = await runElectronFixture();
    sharedResult = result;
  }, 30000);

  it('should perform end-to-end service invocation across preload, renderer, and main using real Electron IPC transport', async () => {
    expect(sharedResult.greetingResult).toBe('Hello E2E');
  });

  it('should perform end-to-end event delivery from main service emit(...) to renderer on(...) listener across real Electron IPC transport', async () => {
    expect(sharedResult.greetingEvents).toEqual(['Hello E2E']);
  });

  it("should keep service channels isolated so one service's calls and events do not cross into another service", async () => {
    expect(sharedResult.myServiceEvents).toEqual(['Hello One']);
    expect(sharedResult.otherServiceEvents).toEqual([7]);
  });

  it('should preserve emitted payload shape across the Electron process boundary for plain object payloads', async () => {
    expect(sharedResult.payloadShape).toEqual({ text: 'after' });
  });

  it('should surface main-side method failure in renderer as a rejected async call across real Electron IPC transport', async () => {
    expect(String(sharedResult.explodeError)).toContain('boom');
    expect(String(sharedResult.explodeError)).toContain('MyService');
    expect(String(sharedResult.explodeError)).toContain('explode');
  });

  it('should handle parallel in-flight calls without mixing responses between call sites', async () => {
    expect(sharedResult.parallel).toEqual(['first', 'second', 'third']);
  });

  it('should fail renderer resolution immediately for an unregistered service in an end-to-end Electron integration scenario', async () => {
    expect(String(sharedResult.unregisteredResolveError)).toContain('not registered');
  });

  it('should verify duplicate registration failure behavior in an end-to-end Electron integration scenario', async () => {
    expect(String(sharedResult.duplicateRegistrationError)).toContain('already registered');
  });

  it('should verify that pre-listener events are not replayed in an end-to-end Electron integration scenario', async () => {
    expect(sharedResult.preListenerReplay).toEqual(['after']);
  });
});

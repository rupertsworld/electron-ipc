import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function requireElectron(): Record<string, unknown> {
  return require('electron') as Record<string, unknown>;
}

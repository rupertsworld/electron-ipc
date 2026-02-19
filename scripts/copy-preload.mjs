import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve('src/preload.cjs');
const dist = path.resolve('dist/preload.cjs');
const distCjs = path.resolve('dist/cjs/preload.cjs');

mkdirSync(path.dirname(dist), { recursive: true });
mkdirSync(path.dirname(distCjs), { recursive: true });
cpSync(src, dist);
cpSync(src, distCjs);

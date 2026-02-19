import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cjsDir = path.resolve('dist/cjs');

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (fullPath.endsWith('.js')) {
      const content = readFileSync(fullPath, 'utf8')
        .replaceAll(/require\("(\.\/[^"]+)\.js"\)/g, 'require("$1.cjs")')
        .replaceAll(/require\("(\.\.\/[^"]+)\.js"\)/g, 'require("$1.cjs")');
      writeFileSync(fullPath, content);
      renameSync(fullPath, fullPath.replace(/\.js$/, '.cjs'));
    }
  }
}

walk(cjsDir);

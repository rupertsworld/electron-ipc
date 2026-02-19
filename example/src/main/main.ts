import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';
import { exposeIPC, getPreloadPath, IPCService } from '../../../dist/index.js';
import type { CounterServiceEvents, ICounterService } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CounterService extends IPCService<CounterServiceEvents> implements ICounterService {
  #count = 0;

  increment(step = 1): number {
    this.#count += step;
    this.emit('countUpdated', { count: this.#count });
    return this.#count;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 520,
    height: 420,
    minWidth: 460,
    minHeight: 360,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  exposeIPC(CounterService);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { resolveIPCService } from '../../../dist/renderer.js';
import type { ICounterService } from '../shared/types.js';

const countEl = document.getElementById('count') as HTMLSpanElement;
const logEl = document.getElementById('log') as HTMLUListElement;
const buttonEl = document.getElementById('increment') as HTMLButtonElement;

const counterService = resolveIPCService<ICounterService>('CounterService');

function appendLog(message: string): void {
  const item = document.createElement('li');
  item.textContent = message;
  logEl.append(item);
  logEl.scrollTop = logEl.scrollHeight;
}

counterService.on('countUpdated', ({ count }) => {
  countEl.textContent = String(count);
  appendLog(`Received event 'countUpdated': count=${JSON.stringify(count)}`);
});

buttonEl.addEventListener('click', async () => {
  buttonEl.disabled = true;
  appendLog('Calling CounterService.increment(1)...');
  try {
    const result = await counterService.increment(1);
    countEl.textContent = String(result);
    appendLog(`Method returned: ${result}`);
  } catch (error) {
    appendLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    buttonEl.disabled = false;
  }
});

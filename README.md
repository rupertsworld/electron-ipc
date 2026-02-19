# electron-ipc

Make your Electron IPC a pleasure to use, and never think about `preload.ts` again! This package lets renderer code call main-process services as if they were local objects, with typed event payloads, and a lovely dev experience.

## Why use this

- You hate wiring up IPC in main, renderer, and preload
- Define one shared service contract used by main and renderer
- Get deterministic errors with service/method context
- Handle method calls and events

## Install

```bash
npm install @rupertsworld/electron-ipc
```

## Quick start

First, define the API you want to call from renderer:

```ts
// main/my-service.ts
import { IPCService } from '@rupertsworld/electron-ipc';

export type MyAPIEvents = {
  greeting: { text: string };
};

export class MyAPI extends IPCService<MyAPIEvents> {
  hello(name: string) {
    this.emit('greeting', { text: `Hello ${name}` });
  }
}
```

Next, expose the IPC service in your main process, and set up the preload script (want to use your own preload? see advanced below).

```ts
// main/index.ts
import { exposeIPC, getPreloadPath } from '@rupertsworld/electron-ipc';
import { MyService } from './my-service.ts';
import { BrowserWindow } from 'electron';

exposeIPC(MyService);

const window = new BrowserWindow({
  webPreferences: {
    preload: getPreloadPath(),
  },
});
```

Now, simply resolve your API and start using it!

```ts
// renderer/index.ts
import { resolveIPC } from '@rupertsworld/electron-ipc/renderer';
import type { MyAPI } from '../main/my-service.ts';

const api = resolveIPC<MyAPI>('MyService');

api.on('greeting', ({ text }) => {
  console.log(text);
});

await api.hello('Rupert'); // Hello Rupert
```

Note: when using renderer import from `@rupertsworld/electron-ipc/renderer`.


### Advanced: custom preload

```ts
// preload.ts
import { enableIPC } from '@rupertsworld/electron-ipc';

enableIPC();
```

Use `getPreloadPath()` by default. Use custom preload + `enableIPC()` when you need to own preload wiring (for example adding other preload-only APIs, custom security checks, or project-specific preload boot order).

Important: a consumer-authored preload must be emitted in a format Electron preload can execute in your app setup (commonly bundled/transformed to CJS). Do not point `webPreferences.preload` at raw TypeScript source.

## Try the example app

The repository includes a minimal typed Electron app under `example/`.

From the package root:

```bash
npm run --prefix example start
```

## API

Full API reference: [`docs/api.md`](./docs/api.md)

## Contributing

See [docs/contributing.md](./docs/contributing.md)
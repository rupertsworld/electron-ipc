# electron-ipc

Typed, service-oriented IPC for Electron apps.

`@rupertsworld/electron-ipc` lets renderer code call main-process services as if they were local objects, with typed event payloads.

## Why use this

- Keep IPC wiring out of feature code.
- Define one shared service contract used by main and renderer.
- Get deterministic errors with service/method context.
- Keep event-driven flows typed and ergonomic.

## Install

```bash
npm install @rupertsworld/electron-ipc
```

## Quick start

### 1) Define a shared service interface

```ts
// shared/my-service.ts
import type { IPCService } from '@rupertsworld/electron-ipc';

export type MyServiceEvents = {
  greeting: { text: string };
};

export interface IMyService extends IPCService<MyServiceEvents> {
  hello(name: string): void;
}
```

### 2) Implement and register in main

```ts
// main/my-service.ts
import { IPCService } from '@rupertsworld/electron-ipc';
import type { IMyService, MyServiceEvents } from '../shared/my-service.ts';

export class MyService extends IPCService<MyServiceEvents> implements IMyService {
  hello(name: string) {
    this.emit('greeting', { text: `Hello ${name}` });
  }
}
```

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

### 3) Advanced: custom preload

```ts
// preload.ts
import { enableIPC } from '@rupertsworld/electron-ipc';

enableIPC();
```

Use `getPreloadPath()` by default. Use custom preload + `enableIPC()` when you need to own preload wiring (for example adding other preload-only APIs, custom security checks, or project-specific preload boot order).

Important: a consumer-authored preload must be emitted in a format Electron preload can execute in your app setup (commonly bundled/transformed to CJS). Do not point `webPreferences.preload` at raw TypeScript source.

### 4) Resolve and use in renderer

```ts
// renderer/index.ts
import { resolveIPC } from '@rupertsworld/electron-ipc/renderer';
import type { IMyService } from '../shared/my-service.ts';

const myService = resolveIPC<IMyService>('MyService');

myService.on('greeting', ({ text }) => {
  console.log(text);
});

await myService.hello('Rupert'); // Hello Rupert
```

Renderer note: import renderer APIs from `@rupertsworld/electron-ipc/renderer`. Use the root package entry for main/preload APIs (`exposeIPC`, `getPreloadPath`, `enableIPC`, `IPCService`).

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
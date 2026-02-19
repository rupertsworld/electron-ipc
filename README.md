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
import { createIPCService } from '@rupertsworld/electron-ipc';
import { MyService } from './my-service.ts';

createIPCService('MyService', MyService);
```

### 3) Enable bridge in preload

```ts
// preload.ts
import { enableIPCBridge } from '@rupertsworld/electron-ipc';

enableIPCBridge();
```

**Preload must be built before use.** Electron’s preload script runs in a context that does not support ES modules. Do not point `webPreferences.preload` at a raw `.ts` or ESM file—it will fail at runtime (“Cannot use import statement outside a module”). Build the preload to a single script (e.g. CommonJS) and pass that path to Electron.

For example, using `esbuild`:

```json
"scripts": {
  "build:preload": "esbuild src/main/preload.ts --bundle --platform=node --format=cjs --outfile=dist/preload.js"
}
```

### 4) Resolve and use in renderer

```ts
// renderer/index.ts
import { resolveIPCService } from '@rupertsworld/electron-ipc';
import type { IMyService } from '../shared/my-service.ts';

const myService = resolveIPCService<IMyService>('MyService');

myService.on('greeting', ({ text }) => {
  console.log(text);
});

await myService.hello('Rupert'); // Hello Rupert
```

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
# Example app

Minimal Electron app that demonstrates:

- calling a main-process IPC service from renderer
- receiving a service event in renderer
- updating UI with method result + event payload
- typed service contracts with `resolveIPCService<ICounterService>(...)`

## Structure

```text
example/
  src/
    main/main.ts
    preload/preload.ts
    renderer/
      index.html
      renderer.ts
    shared/types.ts
  dist/ (generated)
```

## Run

From `electron-ipc/example`:

```bash
npm run start
```

This builds the library, compiles the example to `dist/`, then launches Electron.

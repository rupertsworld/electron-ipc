# Example app

Minimal Electron app that demonstrates:

- calling a main-process IPC service from renderer
- receiving a service event in renderer
- updating UI with method result + event payload
- typed service contracts with `resolveIPC<ICounterService>(...)`
- default preload setup via `getPreloadPath()` (no custom preload file)

## Run

From `electron-ipc/example`:

```bash
npm run start
```

This builds the library, compiles the example to `dist/`, then launches Electron.

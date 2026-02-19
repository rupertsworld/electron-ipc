# API Reference

This reference documents the public developer-facing API for `@rupertsworld/electron-ipc`.

## Core exports

- `IPCService<TEvents>`
- `exposeIPC(serviceOrCtor, serviceName?, deps?)`
- `getPreloadPath()`
- `enableIPC(deps?)`
- `resolveIPC<T>(serviceName)` from `@rupertsworld/electron-ipc/renderer`

---

## `IPCService<TEvents>`

Base class for main-process services that emit typed events.

### Methods

- `on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): this`
- `once<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): this`
- `off<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): this`
- `emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): this`

### Behavior

- `off` is a silent no-op if listener is not registered.
- Events emitted before listener registration are not replayed.
- If one listener throws, other listeners still run.

---

## `exposeIPC(serviceOrCtor, serviceName?, deps?)`

Registers a service in the main process.

### Parameters

- `serviceOrCtor: object | new () => object`
- `serviceName?: string` (defaults to constructor name)
- `deps` (optional runtime injection for tests/custom wiring):
  - `ipcMain`
  - `eventBus`

When `deps` is omitted, Electron defaults are resolved at runtime from the host app.

### Behavior

- Duplicate resolved service name registration throws.
- Service can be provided as class constructor or instance.
- Service methods are invoked by renderer RPC calls.
- Missing/non-callable methods reject with contextual errors.
- Reserved framework method names (`on`, `off`, `once`, `emit`, `setEmitHook`, `constructor`) are not callable as RPC methods.

---

## `getPreloadPath()`

Returns an absolute path to the package-shipped preload script (`preload.cjs`).

### Behavior

- Returns an absolute path.
- Returned path points at an existing file.
- Path is stable across process cwd changes.
- Throws deterministic error text if path resolution fails.

---

## `enableIPC(deps?)`

Sets up preload bridge APIs and exposes them on `window.ipcServiceBridge`.

### Parameters

- `deps` optional preload injection:
  - `contextBridge`
  - `ipcRenderer`

When omitted, Electron defaults are resolved at runtime from the host app.

### Behavior

- Must be called before renderer uses `resolveIPC(...)`.
- Exposes bridge methods:
  - `invoke(serviceName, methodName, args)`
  - `hasService(serviceName)`
  - `on(serviceName, eventName, callback)` returning unsubscribe function

---

## `resolveIPC<T>(serviceName)`

Resolves a typed renderer-facing proxy for a registered main service.

Import path:

- `import { resolveIPC } from '@rupertsworld/electron-ipc/renderer'`

### Behavior

- Throws immediately if service is not registered.
- Non-event methods are async (`Promise`) at call sites over IPC.
- `on`/`once`/`off` are preserved for event subscription semantics.
- Method failures reject with service/method contextual error messages.

### Type mapping

- Use shared interfaces like:
  - `interface IMyService extends IPCService<MyServiceEvents> { ... }`
- Resolve with:
  - `const service = resolveIPC<IMyService>('MyService')`

This keeps event payloads and method signatures typed in renderer usage.

---

## Testing notes

- `npm run test` runs unit + boundary integration tests.
- `npm run test:electron` runs real Electron process integration tests.
- `npm run test:all` runs both.
- Electron integration can require a host environment that supports launching Electron windows.

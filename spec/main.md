# Electron IPC Package Spec

This document defines required behavior for an Electron IPC abstraction package that supports:

- Main-process service registration
- Renderer-process service resolution
- Typed request/response RPC calls
- Typed event emission from main services to renderer subscribers

This is a behavior-first spec. It also includes required architectural constraints where needed to guarantee deterministic cross-environment behavior.

## Goals

- Provide a simple API for exposing main-process services to renderer code.
- Preserve type intent across main/shared/renderer boundaries.
- Make errors and invalid usage deterministic and testable.
- Support event-driven patterns from services (e.g. `greeting` updates).
- Developers should not have to know that IPC exists.

## Runtime compatibility contract

This package must support both ESM and CommonJS consumer projects for main-process usage.

The API contract in this spec (`exposeIPC`, `resolveIPC`, `getPreloadPath`, `enableIPC`) applies across both module systems.

## Defining a service shape

Define the contract in shared code so both main and renderer agree on method names and event payloads. The shared shape is the source of truth for behavior.

The shared service interface can extend `IPCService<MyServiceEvents>` so event behavior remains consistent across services.

```ts
type MyServiceEvents = {
  greeting: { text: string };
};

interface IMyService extends IPCService<MyServiceEvents> {
  hello(name: string);
}
```

## Implementing a service

Implement the shared contract in main by extending `IPCService`. Service methods run in main and can emit typed events to renderer listeners.

```ts
export class MyService extends IPCService<MyServiceEvents> implements IMyService {
  hello(name: string) {
    this.emit('greeting', { text: 'Hello ' + name });
  }
}
```

### Connecting the preload bridge

Default usage must not require consumers to author or bundle a preload file. The package must ship a ready-to-use CommonJS preload script and expose `getPreloadPath()` for `BrowserWindow` configuration.

```ts
import { getPreloadPath } from '@rupertsworld/electron-ipc';

new BrowserWindow({
  webPreferences: {
    preload: getPreloadPath(),
  },
});
```

The shipped preload script is responsible for enabling the bridge before renderer code resolves services.

For advanced usage, the package should still expose `enableIPC()` so consumers can author a custom preload when they need non-default behavior.

```ts
import { enableIPC } from '@rupertsworld/electron-ipc';

enableIPC();
```

### Preload path resolution requirements

`getPreloadPath()` must return an absolute path to the shipped preload script and must be stable across normal Electron build setups.

Required strategy:

1. Resolve the package main entry with `createRequire(import.meta.url).resolve('@rupertsworld/electron-ipc')`.
2. Compute the sibling `preload.cjs` path in the same built output directory.
3. Return that absolute path.

Why this strategy is required:

- It works when consumers do not bundle main-process code.
- It works with standard Electron bundler defaults where dependencies remain externalized in `node_modules` (including common `electron-vite` defaults).
- It avoids fragile relative resolution tied to `import.meta.url` or cwd assumptions.
- It does not require extra consumer setup beyond normal dependency installation.

If resolution fails at runtime, the function must throw a deterministic error that clearly states preload path resolution failed.

### Electron module loading strategy

Main and preload runtime modules should use direct `electron` imports rather than `globalThis.require` indirection.

Rationale:

- It matches standard Electron ecosystem behavior.
- It keeps runtime behavior explicit and predictable.
- It removes special-case runtime hacks that exist only to bypass module loading.

Preload runtime note:

- Preload code must resolve Electron runtime APIs from `electron` and/or `electron/renderer` to obtain `contextBridge` and `ipcRenderer`.
- Which module surface is available is environment-dependent (for example sandboxed preload contexts may differ from non-sandboxed preload contexts).
- The shipped preload path and custom `enableIPC()` path must both tolerate this environment variance and still bind the bridge successfully.
- This does not imply preload consumes main-process APIs such as `ipcMain`, `BrowserWindow`, or `app`.
- Main-process APIs are used only in main-side service registration paths (for example `exposeIPC(...)`).

Tests can use standard module mocking for `electron` in unit suites, with real Electron process coverage in integration suites.

## Registering a service

Register the service in main. The first argument is the service class constructor or an already-created instance. The second argument is an optional service name string used for resolution.

When the name is omitted, the service name defaults to the class name (i.e. `constructor.name`). For a class constructor `MyService`, the default name is `'MyService'`. For an instance `new MyService()`, the default name is also `'MyService'`.

Registering the same service name more than once must fail with an error.

```ts
exposeIPC(myService);                    // registered as 'MyService'
exposeIPC(myService, 'CustomName');       // registered as 'CustomName'
```

## Resolving a service

Resolve the service in renderer by the name it was registered under. When the service was registered without an explicit name, resolve using the class name. Calls should feel like normal service calls while running across IPC.

Resolving a service name that is not registered in main must fail immediately at resolve time.

Calling a method that does not exist on the registered service must reject with an error that includes service and method context.

Calling reserved framework method names (for example `on`, `off`, `once`, `emit`) must reject as non-callable service methods.

If a service method throws, renderer should receive the original error message when feasible. If full error transport is not feasible, a deterministic fallback error message must still include service and method context.

```ts
const myService = resolveIPC<IMyService>('MyService');
const onGreeting = (payload: { text: string }) => console.log(payload.text);
myService.on('greeting', onGreeting);
await myService.hello('Bob');
myService.off('greeting', onGreeting);
```

## Events

Events should be typed by event name on the renderer side.

Emitter behavior follows familiar conventions:

- `off(event, listener)` is a silent no-op if the listener is not currently registered.
- Events emitted before listeners are attached are dropped (no replay).
- If one listener throws, other listeners for the same event still run.
- Renderer calls behave asynchronously and can be awaited.

## Out of scope

- Service teardown or unregister behavior (for example `disposeIPCService`).
- Listener cleanup semantics during service teardown.

## Tests

### Service shape and typing

- should compile when shared service interface extends `IPCService<MyServiceEvents>` and declares service methods.
- should infer event payload type from event name on `myService.on(...)` in renderer usage.
- should reject invalid event names at compile time in renderer usage.
- should reject invalid event payload property access at compile time in renderer listeners.

### Preload bridge

- should return an absolute existing file path from `getPreloadPath()`.
- should return a path whose basename is `preload.cjs`.
- should return the same path regardless of process cwd.
- should return the same path regardless of process cwd when called from nested consumer directories (for example `example/`).
- should ensure shipped `preload.cjs` does not rely on Node built-ins unavailable in sandboxed preload runtimes.
- should expose bridge APIs to renderer when `BrowserWindow` preload is configured with `getPreloadPath()`.
- should fail predictably when renderer resolves a service before the bridge is enabled.
- should allow renderer service resolution after bridge enablement using both shipped preload and custom `enableIPC()` preload.

### Main-process module loading

- should allow creating and registering services in main with direct `electron` imports and no runtime `requireElectron` helper path.
- should keep unit tests deterministic via `electron` module mocking without requiring a live Electron runtime.

### Service registration in main

- should register a service class using its class name when no explicit name is provided.
- should register a service class under a custom name when one is provided.
- should register an already-created instance using its constructor name when no explicit name is provided.
- should register an already-created instance under a custom name when one is provided.
- should fail when registering the same service name more than once.
- should allow registering multiple distinct service names in the same process.

### Service resolution in renderer

- should resolve a service registered with default class name.
- should resolve a service registered with a custom name using that custom name.
- should fail immediately when resolving a service name that is not registered.
- should fail when resolving by class name if the service was registered with a custom name.
- should allow resolving the same registered service name from multiple renderer call sites.

### RPC method invocation behavior

- should invoke registered service methods from renderer and complete asynchronously.
- should return method results from main to renderer correctly across IPC.
- should pass method arguments from renderer to main in the original order.
- should reject when calling a method name that does not exist on the registered service.
- should reject when calling reserved framework method names as service methods.
- should reject when attempting to invoke a non-callable member name on the registered service.
- should include service and method context in missing-method rejection errors.
- should propagate thrown method errors from main to renderer with original error message when feasible.
- should provide deterministic fallback error text with service and method context when full error transport is not feasible.

### Event behavior

- should emit events from main service methods and deliver typed payloads to renderer listeners.
- should deliver the same emitted event to all listeners currently attached for that event.
- should invoke a `once` listener exactly once across multiple emissions of the same event.
- should remove a listener with `off(event, listener)` so it does not receive future emissions.
- should treat `off(event, listener)` as a silent no-op when the listener is not currently registered.
- should drop events emitted before listeners are attached (no replay).
- should continue delivering an event to remaining listeners when one listener throws.

### Electron boundary integration

Real Electron end-to-end coverage is specified in `spec/integration-test.md`. Source tests for that suite should mirror wording from that document.

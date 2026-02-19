# Electron IPC Package Spec

This document defines required behavior for an Electron IPC abstraction package that supports:

- Main-process service registration
- Renderer-process service resolution
- Typed request/response RPC calls
- Typed event emission from main services to renderer subscribers

This is a behavior spec only. Implementation details are left up to the implementer.

## Goals

- Provide a simple API for exposing main-process services to renderer code.
- Preserve type intent across main/shared/renderer boundaries.
- Make errors and invalid usage deterministic and testable.
- Support event-driven patterns from services (e.g. `greeting` updates).
- Developers should not have to know that IPC exists.

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

The preload layer must expose the bridge with a function like `enableIPCBridge()`. Main and renderer usage assumes this bridge has been enabled before renderer code resolves services.

```ts
enableIPCBridge();
```

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

- should expose bridge APIs to renderer only after `enableIPCBridge()` is executed in preload.
- should fail predictably when renderer resolves a service before the preload bridge is enabled.
- should allow renderer service resolution after preload bridge is enabled.

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

Execution note: these tests run in a dedicated real-Electron integration suite and may require an explicit opt-in flag (for example `ELECTRON_E2E=1`) plus a host environment capable of launching Electron windows. These tests MUST test an actual electron app instance end-to-end.

- should perform end-to-end service invocation across preload, renderer, and main using real Electron IPC transport.
- should perform end-to-end event delivery from main service `emit(...)` to renderer `on(...)` listener across real Electron IPC transport.
- should keep service channels isolated so one service's calls and events do not cross into another service.
- should preserve emitted payload shape across the Electron process boundary for plain object payloads.
- should surface main-side method failure in renderer as a rejected async call across real Electron IPC transport.
- should handle parallel in-flight calls without mixing responses between call sites.
- should fail renderer resolution immediately for an unregistered service in an end-to-end Electron integration scenario.
- should verify duplicate registration failure behavior in an end-to-end Electron integration scenario.
- should verify that pre-listener events are not replayed in an end-to-end Electron integration scenario.

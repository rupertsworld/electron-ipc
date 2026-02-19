# Electron IPC Integration Test Spec

This document defines required real-Electron integration coverage for the Electron IPC package.

These tests validate full runtime behavior across:

- Main process service registration and execution (backend path)
- Preload bridge enablement and IPC boundary wiring
- Renderer service resolution, RPC invocation, and event subscription (frontend path)

Unit tests are not sufficient for this document. Every requirement here must execute against a real Electron app instance.

## Scope

The integration suite must verify observable behavior from the renderer call site through preload and IPC transport into main, then back to renderer.

The suite must cover:

- Request/response RPC flow
- Event flow (main emit -> renderer listener)
- Error flow and deterministic failure surfaces
- Multi-service channel isolation
- Build/runtime environment compatibility for shipped preload usage

## Real Electron environment requirements

Integration tests in this spec must run in a real Electron runtime, not a mocked `electron` module and not a pure Node-only harness.

Required environment characteristics:

- Electron main process is launched as an actual app process.
- At least one `BrowserWindow` is created.
- Integration fixtures for shipped-preload targets must create windows with `webPreferences.sandbox: true`.
- Renderer code executes in that window context.
- `webPreferences.preload` points to an actual preload file path.
- Calls traverse real `ipcMain` and `ipcRenderer` channels.

Execution policy:

- Suite may be gated behind an explicit opt-in flag (for example `ELECTRON_E2E=1`).
- If Electron cannot be launched on host CI, tests should skip with a deterministic skip reason.
- Local developer workflow should provide a direct way to run this suite only.

## Test topology

The harness should include a minimal test app with:

- Shared service contract and events
- Main service implementation extending `IPCService`
- Window bootstrapping with preload configured from `getPreloadPath()`
- Renderer entry that resolves service and reports results back to the test runner

Observable assertions should be collected through explicit test channels (for example test-only IPC signals) rather than reading private internals.

## Environment strategy

Use a matrix strategy that separates two independent dimensions:

- Packaging path: bundled main process vs non-bundled main process
- Module format at runtime: ESM vs CommonJS

The integration suite must require coverage across the full cross-product so behavior is proven independent of build style.

## Required environment targets

The following targets are required and must all pass the same behavioral assertions:

1. Non-bundled + ESM main process.
2. Non-bundled + CommonJS main process.
3. Bundled + ESM output main process (dependencies externalized).
4. Bundled + CommonJS output main process (dependencies externalized).
5. Custom preload fallback using `enableIPC()` for non-standard bundling setups.

Notes:

- "Dependencies externalized" means runtime package resolution still comes from `node_modules`.
- The same test contract must pass for all required targets; target-specific assertions should be additive only.
- The default preload path in all required targets should use `getPreloadPath()`.
- The custom preload target must use a consumer-authored preload that invokes `enableIPC()`.

## Required end-to-end behaviors

### Full request/response path

Renderer `resolveIPC(...).method(...)` must:

1. Resolve service through bridge APIs exposed by preload.
2. Send request over real Electron IPC transport to main.
3. Invoke registered service method in main.
4. Return result to renderer promise resolution with expected value and shape.

### Full event path

Main service `emit(eventName, payload)` must:

1. Traverse real IPC event channel wiring.
2. Reach renderer listener registered with `on(...)` or `once(...)`.
3. Preserve payload shape and values across process boundary.

### Full error path

Failures must be observable in renderer with deterministic behavior:

- Unregistered service resolve fails immediately.
- Missing method invocation rejects with service + method context.
- Service method throw in main surfaces as renderer rejection with original message when feasible, else deterministic fallback message with service + method context.

### Channel and call isolation

The transport must keep unrelated flows isolated:

- Two registered services must not cross-call or cross-deliver events.
- Parallel in-flight calls must resolve to the correct originating call site.
- Listener removal via `off(...)` must stop future delivery for that listener.

## Additional preload path assertions

For shipped preload usage (`getPreloadPath()`):

- Returned path must be absolute.
- Returned path must exist on disk at runtime.
- Returned path basename must be `preload.cjs`.
- Returned path must be stable regardless of process cwd.
- Returned path must remain stable when process cwd is a nested consumer app directory.

For custom preload usage (`enableIPC()`):

- Custom preload script can enable bridge without shipped preload path helper.
- Renderer behavior remains consistent with shipped preload behavior.

## Out of scope

- Performance benchmarking of IPC latency.
- Security hardening policies outside the package contract.
- App-specific renderer frameworks and state-management concerns.

## Tests

- should run integration coverage in a real Electron runtime with an actual `BrowserWindow`.
- should traverse full backend-to-frontend RPC path from renderer `resolveIPC(...).method(...)` to main service and back.
- should traverse full backend-to-frontend event path from main `emit(...)` to renderer listeners.
- should preserve payload shape for plain-object request/response and event payloads across process boundary.
- should fail renderer resolve immediately for unregistered service names in real Electron runtime.
- should reject missing or non-callable method invocations with deterministic service + method context.
- should surface main-thrown method failures as renderer rejections with original message when feasible.
- should isolate channels and event streams across multiple registered services.
- should keep parallel in-flight calls correlated to the correct renderer call site.
- should stop delivery to removed listeners while continuing delivery to still-registered listeners.
- should pass in required target: non-bundled + ESM main process using `getPreloadPath()`.
- should pass in required target: non-bundled + CommonJS main process using `getPreloadPath()`.
- should pass in required target: bundled + ESM output main process with dependencies externalized and `getPreloadPath()`.
- should pass in required target: bundled + CommonJS output main process with dependencies externalized and `getPreloadPath()`.
- should pass in required target: custom preload fallback using `enableIPC()` in non-standard bundling setups.
- should run shipped-preload integration targets with BrowserWindow sandbox enabled.
- should validate shipped preload path invariants: absolute path, existence, `preload.cjs` basename, cwd-stable result.

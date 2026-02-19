# Example Project Spec

This document specifies the single example consumer application shipped with `electron-ipc`.

The example exists to demonstrate intended usage in a simple, readable Electron app.

## Purpose

The example project serves as a reference for how consumers use the package across:

- Shared service contract typing
- Main-process service registration
- Preload bridge enablement
- Renderer service resolution and invocation
- Event delivery from main to renderer

The example should stay lightweight and focused on package usage rather than app-specific architecture.

## File system location

The example project must live at:

- `example/`

Core source locations:

- `example/src/shared/` for shared contracts and event types
- `example/src/main/` for Electron main-process bootstrap and service registration
- `example/src/renderer/` for renderer UI and service consumption

Build output location:

- `example/dist/` (generated artifacts only)

The example should remain self-contained and runnable from within `example/`.

## Required project shape

The example should include:

- A shared service interface that extends `IPCService<...>` with typed events.
- A main-process service implementation that emits at least one typed event.
- A preload entry that enables the bridge.
- A renderer entry that resolves the service and performs a method call.
- A minimal HTML UI that displays method results and received event payloads.

The project should avoid unrelated framework abstractions that obscure core IPC usage.

## Runtime behavior

When run, the example app should demonstrate the complete path from frontend to backend and back:

1. Renderer resolves a named service.
2. Renderer invokes a service method via async call.
3. Main service executes and returns a result.
4. Main service emits an event with typed payload.
5. Renderer listener receives and renders the event payload.

The example UI should make these outcomes visible without requiring debugger inspection.

## Out of scope

- Production app architecture patterns
- Styling or UI framework choices beyond minimal demonstration needs
- Feature-rich demo logic unrelated to IPC contract behavior

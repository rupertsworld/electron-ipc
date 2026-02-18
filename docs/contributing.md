# Contributing

Thanks for contributing to `@rupertsworld/electron-ipc`.

## Setup

From the package root:

```bash
npm install
```

## Development workflow

- Make focused changes with matching tests.
- Keep service contracts shared between main and renderer.
- Prefer behavior-preserving refactors unless the change is intentional and documented.

## Testing

- `npm run test` runs unit + boundary integration tests.
- `npm run test:all` runs default tests plus real Electron process integration tests.
- `npm run test:electron` runs only real Electron process integration tests.
  - Requires a host environment that can launch Electron windows.
  - Enabled via `ELECTRON_E2E=1`.

## Build

- `npm run build` emits `dist/` with ESM JavaScript and `.d.ts` types.

## Publishing

- `npm publish` is guarded by `prepublishOnly`.
- `prepublishOnly` runs `type-check`, `test`, and `build` before publish.

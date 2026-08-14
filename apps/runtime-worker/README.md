# runtime-worker

Local HTTP server for browser automation and project file I/O.

## Production bundle

Build the runtime bundle with `pnpm run build:bundle` — outputs `dist/bundle.mjs`, the
single-file bundle the VS Code extension copies into its VSIX (see
`apps/vscode-extension/PACKAGING.md`). Dev-only paths (`scripts/`, `tests/`, `src/`, configs)
are never included in that bundle.

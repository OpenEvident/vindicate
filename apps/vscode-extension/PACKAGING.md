# VSIX packaging (developers)

Internal build notes for this extension. **Not shown on the Marketplace** — user-facing copy lives in [`README.md`](./README.md).

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) (from repo root: `pnpm install`)
- Extension build dependencies are installed via the monorepo workspace

## Scripts

| Script | What it does |
|--------|----------------|
| `pnpm run build` | Bundle worker + MCP, build extension host (`esbuild`) and webview (`vite`). |
| `pnpm run build:extension` | Extension host only (assumes runtime bundles already copied). |
| `pnpm run watch` / `dev` | Watch mode for extension + webview during development. |
| `pnpm run package` | Full release build: `build` → `vsce package`. |
| `pnpm run package:vsix` | Alias for `package`. |
| `pnpm run clean` | Remove `dist/`. |
| `pnpm run verify` | Typecheck, lint, unit tests. |
| `pnpm run verify:bundle` | Assert worker/MCP/webview outputs and all six keyring `.node` files (after `build`). |
| `pnpm run test:e2e` | Build + VS Code extension tests. |

From the **repo root**:

```bash
pnpm --filter vindicate run package
```

## Packaging (VSIX)

```bash
cd apps/vscode-extension
pnpm run package:vsix
```

Pipeline:

1. **`build`** — esbuild bundles for `@vindicate/runtime-worker` and `@vindicate/runtime-mcp`, copies them into `dist/bundled/`, builds `dist/extension.js` and `dist/webview/`.
2. **`vsce package --no-dependencies`** — creates the installable VSIX (dependencies are already bundled; no `node_modules` in the package).

### Output location

The VSIX is written next to this `package.json`:

```text
apps/vscode-extension/vindicate-<version>.vsix
```

Example: `vindicate-0.1.0.vsix` (name and version come from `package.json`).

### Install locally

```bash
code --install-extension vindicate-0.1.0.vsix
```

Or in VS Code / Cursor: **Extensions** → `...` → **Install from VSIX...**

## What goes inside the VSIX

| Path in extension | Source |
|-------------------|--------|
| `dist/extension.js` | Extension activation / orchestration |
| `dist/bundled/runtime-worker/` | Worker `bundle.mjs`, `@napi-rs` (all platforms), `chromium-bidi` |
| `dist/bundled/package.json` | Stub package root required by playwright-core inside the worker bundle |
| `dist/bundled/browsers.json` | Playwright browser revision metadata |
| `dist/bundled/runtime-mcp/bundle.mjs` | MCP server bundle |
| `dist/webview/main.js`, `main.css` | Sidebar / panel UI |
| `resources/` | Icons and brand assets |

Cross-platform native modules: `scripts/ensure-keyring-platforms.mjs` downloads all six `@napi-rs/keyring-*` platform packages during `pnpm run build` (Linux CI friendly). `pnpm run verify:bundle` asserts every `.node` is present before release packaging.

## GitHub release (manual)

Workflow: `.github/workflows/vscode-extension-release.yml` (`workflow_dispatch` only — not on PR/commit).

Inputs:

| Input | Purpose |
|-------|---------|
| `bump` | patch / minor / major on `apps/vscode-extension/package.json` only |

Pipeline: bump → commit → tag `vscode-vX.Y.Z` → build on Ubuntu → `verify:bundle` → VSIX + SHA256 → GitHub Release artifact.

Local equivalent:

```bash
pnpm --filter vindicate run build
pnpm --filter vindicate run verify:bundle
pnpm --filter vindicate run package
```

Intermediate bundle outputs (before copy):

- `apps/runtime-worker/dist/bundle.mjs`
- `apps/runtime-mcp/dist/bundle.mjs`

At runtime the extension spawns worker and MCP from `dist/bundled/` via `node` (see `WorkerManager`, `McpManager`).

## Development workflow

1. Open the monorepo in VS Code or Cursor.
2. **Run Extension** (F5) from `apps/vscode-extension`, or use `pnpm run watch` and reload the window.
3. Ensure runtime worker / MCP env vars match other apps (`VINDICATE_INTERNAL_KEY`, etc.) — see root `README.md` and `apps/runtime-worker/.env.example`.

For a quick installable build:

```bash
pnpm run package:vsix
```

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `Missing dist/bundled/...` | Run `pnpm run build` before `package:vsix`. |
| `Runtime not built` at runtime | Run `pnpm run build` in this package. |
| VSIX missing after command | Confirm cwd is `apps/vscode-extension`; VSIX name is `vindicate-<version>.vsix`. |
| `not compatible with VS Code 1.105.x` on install | Editor is older than `engines.vscode`. Keep `engines.vscode` and `@types/vscode` on the same version (e.g. `^1.105.0`), rebuild the VSIX, or upgrade the editor. |
| `vsce`: `@types/vscode` greater than `engines.vscode` | Bump `engines.vscode` to match `@types/vscode`, or lower `@types/vscode` to match the editor you target. |
| Mac: `Cannot find native binding` / `@napi-rs/keyring-darwin-arm64` | VSIX was built without all platform keyring binaries. Rebuild with current packaging scripts (`ensure-keyring-platforms.mjs` downloads darwin/linux/win32 `.node` files during `pnpm run build`). Requires network on first build. |

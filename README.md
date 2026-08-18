# Vindicate Platform

Monorepo for Vindicate — AI-native Playwright test automation for VS Code, Cursor, and Claude Code.

![GitHub top language](https://img.shields.io/github/languages/top/OpenEvident/vindicate)
![visitor badge](https://visitor-badge.glitch.me/badge?page_id=ThusharaX.C-programming)
![GitHub forks](https://img.shields.io/github/forks/OpenEvident/vindicate?style=social)
![GitHub contributors](https://img.shields.io/github/contributors/OpenEvident/vindicate)
![GitHub Repo stars](https://img.shields.io/github/stars/OpenEvident/vindicate?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/OpenEvident/vindicate)
![GitHub watchers](https://img.shields.io/github/watchers/OpenEvident/vindicate?style=social)
![GitHub issues](https://img.shields.io/github/issues/OpenEvident/vindicate)
![GitHub pull requests](https://img.shields.io/github/issues-pr/OpenEvident/vindicate)
![GitHub labels](https://img.shields.io/github/labels/OpenEvident/vindicate/help%20wanted)
![GitHub](https://img.shields.io/github/license/OpenEvident/vindicate)

![C-programming](https://socialify.git.ci/OpenEvident/vindicate/image?description=1&forks=1&language=1&logo=https%3A%2F%2Fraw.githubusercontent.com%2FBinaryMatter%2FBinaryMatter.github.io%2Fgh-pages%2FlogoRoundwithBorder.png&owner=1&pattern=Circuit%20Board&stargazers=1&theme=Dark)

## Architecture

Vindicate is a **stateless local stack**: the VS Code extension installs rules + skills, then agents call a local MCP server that serves workflow guidance and browser/codegen tools. No cloud job machine, no MongoDB, no remote orchestration on the runtime path.

```
Agent (Cursor / Claude Code / Copilot)
  ├─ L0 rules + L1 skill (installed by extension)
  └─ runtime-mcp @ 127.0.0.1 (stateless)
       ├─ vindicate_workflow → bundled graphs + nodes + refs
       ├─ browser_* / browser_record_* → runtime-worker @ 127.0.0.1
       ├─ vindicate_generate_code (4 ops) · run_tests · scaffold_project
       └─ vindicate_ask_user · vindicate_design · vindicate_show_panel
```

## Workspace layout

```text
apps/
  runtime-mcp/      Local MCP server (workflow + codegen + tools)
  runtime-worker/   Playwright browser + recording worker
  vscode-extension/ VS Code / Cursor extension
  vindicate-ui/        Bundled MCP Apps panel UI
packages/
  protocol/         Shared Zod contracts
```

## Tooling

- Node.js `>=22`
- pnpm `>=10`
- Turborepo

## Common commands

From repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Build the runnable apps:

```bash
pnpm turbo build --filter=@vindicate/runtime-mcp
pnpm turbo build --filter=@vindicate/runtime-worker
pnpm turbo build --filter=vindicate
```

## Governance docs

- `docs/ARCHITECTURE.md`
- `docs/SECURITY_BASELINE.md`
- `docs/SUPPLY_CHAIN_BASELINE.md`
- `docs/CONTRIBUTING.md`

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

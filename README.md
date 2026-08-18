<div align="center">

<img src="apps/vscode-extension/resources/vindicate-logo-1024.png" alt="Vindicate" width="128" />

# Vindicate Platform

**Autonomous quality for AI-native development teams.**

AI-native Playwright test automation for VS Code, Cursor, GitHub Copilot, Claude Code, and Antigravity.

![GitHub top language](https://img.shields.io/github/languages/top/OpenEvident/vindicate)
![visitors](https://visitor-badge.laobi.icu/badge?page_id=OpenEvident.vindicate.visitor-badge&left_text=visitors&right_color=%23123fc4&format=true&logo=github)
![GitHub forks](https://img.shields.io/github/forks/OpenEvident/vindicate?style=social)
![GitHub contributors](https://img.shields.io/github/contributors/OpenEvident/vindicate)
![GitHub Repo stars](https://img.shields.io/github/stars/OpenEvident/vindicate?style=social)
![GitHub repo size](https://img.shields.io/github/repo-size/OpenEvident/vindicate)
![GitHub watchers](https://img.shields.io/github/watchers/OpenEvident/vindicate?style=social)
![GitHub issues](https://img.shields.io/github/issues/OpenEvident/vindicate)
![GitHub pull requests](https://img.shields.io/github/issues-pr/OpenEvident/vindicate)
![GitHub](https://img.shields.io/github/license/OpenEvident/vindicate)

</div>

## Architecture

Vindicate is a **stateless local stack**. The extension installs rules and skills, then your agent (Cursor, GitHub Copilot, Claude Code, or Antigravity) calls a local MCP server for workflow guidance, codegen, and browser tools. No cloud job machine, no MongoDB, no remote orchestration.

```mermaid
flowchart TB
    subgraph ide["Your editor"]
        Agent["AI agent"]
        Ext["Vindicate extension"]
    end

    subgraph local["This machine, 127.0.0.1 only"]
        MCP["runtime-mcp"]
        Worker["runtime-worker"]
        Chromium["Chromium"]
    end

    Agent -->|MCP tools| MCP
    Ext -->|spawns + supervises| MCP
    Ext -->|spawns + supervises| Worker
    MCP -->|browser / record / API| Worker
    Worker --> Chromium
```

| Component                      | Role                                                      |
| ------------------------------ | --------------------------------------------------------- |
| **VS Code / Cursor extension** | Onboarding, dashboard, agent pairing, process supervisor  |
| **runtime-mcp**                | MCP server the agent talks to: workflow, codegen, tools   |
| **runtime-worker**             | Playwright browser sessions, recordings, and API requests |

`runtime-mcp` and `runtime-worker` are machine-wide singletons. Isolation between projects is per session, not per process. Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Workspace layout

```text
apps/
  runtime-mcp/       Local MCP server (workflow + codegen + tools)
  runtime-worker/    Playwright browser + recording worker
  vscode-extension/  VS Code / Cursor extension
  vindicate-ui/      Bundled MCP Apps panel UI
packages/
  protocol/          Shared Zod contracts
  config/            Shared configuration presets
  security/          Security policy and auth types
  observability/     Structured logging (Pino)
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

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Security baseline](docs/SECURITY_BASELINE.md)
- [Supply-chain baseline](docs/SUPPLY_CHAIN_BASELINE.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

## Contributors

<a href="https://github.com/OpenEvident/vindicate/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=OpenEvident/vindicate" alt="Contributors to OpenEvident/vindicate" />
</a>

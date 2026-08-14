# Vindicate

**Autonomous quality for AI-native development teams.**

Vindicate is an AI-native quality orchestrator for VS Code and Cursor. It connects your workspace, pairs with your coding agents, scaffolds the right project context, and helps keep specs, tests, and implementation aligned.

## Why Vindicate

- **AI moves fast. Vindicate keeps quality visible.**
- **Specs and tests stay connected to intent, not just implementation.**
- **Project health is tracked from requirement coverage through test results.**

## What's in the extension

- **Guided onboarding** for sign-in, agent selection, MCP setup, and project-mode selection
- **Agent pairing** for Cursor, GitHub Copilot, and Claude Code
- **Project health dashboard** with overall score, spec completeness, traceability, pass rate, freshness, failing tests, and acceptance-criteria coverage
- **Prompt library** with built-in onboarding/domain/spec/test prompts plus private custom templates
- **Config center** to add, re-sync, or disconnect MCP-enabled agents and re-check runtime and MCP health
- **Sidebar quick actions** to run all tests, sync metrics from disk, and monitor onboarding progress
- **Command access** for opening home, opening the panel, signing in/out, and quick actions from the status bar

## Vindicate MCP integration

When you connect an agent (Cursor, Claude Code, or Copilot), the extension installs:

- **L0 rules** — always-on guidance to call `vindicate_workflow` first
- **L1 skill** — `.cursor/skills/vindicate/`, `.claude/skills/vindicate/`, or `.github/skills/vindicate/` with `SKILL.md` + `communication.md`

The extension spawns the local **runtime-mcp** and **runtime-worker** processes. Health checks cover runtime + MCP only (no cloud dimension).

## Get started

1. Install the extension.
2. Open a workspace folder.
3. Open the **Vindicate** activity bar.
4. Sign in with your Vindicate account.
5. Choose the agents you use on this project.
6. Complete onboarding to scaffold domain, specs, and test foundations.

## Supported agents

- Cursor
- GitHub Copilot
- Claude Code

## Commands

- `Vindicate: Open Home`
- `Vindicate: Show Panel`
- `Vindicate: Sign In`
- `Vindicate: Sign Out`
- `Vindicate: Quick Actions`

## Requirements

- VS Code or Cursor **1.105** or newer
- An Vindicate account
- A workspace folder open for full onboarding, MCP, and project health features

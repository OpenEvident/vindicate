# CI Contract

This document defines required CI behavior for the root monorepo.

## Required status checks

All pull requests affecting monorepo source and root workspace config files must pass:

1. `lint`
2. `typecheck`
3. `test`
4. `build`

## Workflow behavior

- Trigger on pull requests and pushes to `main` when files under `apps/**`, `packages/**`, `docs/**`,
  or root workspace config files change.
- Execute commands from repository root.
- Use Node.js and pnpm versions compatible with `engines`.

## Caching strategy

- Enable pnpm store caching in CI.
- Enable pnpm store and Turborepo caching where supported.
- Cache keys should include:
  - lockfile hash
  - `turbo.json`
  - root TypeScript/eslint/prettier config hashes

## Branch protection expectations

- `main` must require all status checks.
- No direct pushes to protected branches.
- At least one code-owner review for runtime, packaging, and security-sensitive areas.

## Future enhancements

- Add SCA/vulnerability scans and license checks.
- Add provenance attestation for release artifacts.
- Add coverage thresholds when test suites are implemented.

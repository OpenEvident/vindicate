# Contributing

## Branching and pull requests

- Create short-lived feature branches.
- Keep pull requests focused and reviewable.
- Link architecture-impacting changes to an ADR update.

## Required checks

Before requesting review, run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Commit convention

Use Conventional Commits:

- `feat:`
- `fix:`
- `chore:`
- `docs:`
- `refactor:`
- `test:`

## Quality standards

- Keep strict TypeScript settings enabled.
- Prefer explicit interfaces in `packages/protocol` for service boundaries.
- Avoid leaking secrets or proprietary skills into repository files.

## Security requirements

- Never commit credentials, tokens, private keys, or customer secrets.
- Follow `docs/SECURITY_BASELINE.md` for control requirements.
- Follow `docs/SUPPLY_CHAIN_BASELINE.md` for dependency governance.

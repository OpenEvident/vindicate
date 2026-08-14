# Supply Chain Baseline

## Dependency governance

- Use `pnpm` workspaces with a committed lockfile.
- Avoid unpinned transitive overrides unless justified and documented.
- Review dependency additions in pull requests.

## Build integrity

- Use reproducible builds from lockfile state.
- Enforce Node and pnpm versions through `engines` and CI checks.
- Prefer minimal build images and immutable CI runners where possible.

## Vulnerability management

- Run `pnpm audit` in CI.
- Track severity thresholds and remediation SLA.
- Maintain an exception process for accepted temporary risk.

## Provenance and release posture

- Generate build metadata for release artifacts (version, commit SHA, build timestamp).
- Sign production-distributed binaries/packages when distribution starts.
- Maintain checksum verification guidance for enterprise customers.

## Repository controls

- Branch protection on main.
- Mandatory status checks.
- CODEOWNERS for critical surfaces (auth, runtime, skill-delivery).

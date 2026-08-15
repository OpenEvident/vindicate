# @vindicate/protocol

Shared contract package for the Vindicate v2 platform.

## Scope

This package owns cross-service contracts only:

- control API payloads (auth, jobs, runs)
- skills service payloads (workflow sessions, packs, search)
- runtime/worker command envelopes
- MCP tool request/response envelopes
- shared error model and protocol versioning

This package does **not** own service business logic, persistence, or transport implementation.

## Usage

```ts
import { JobCreateRequestSchema, parseProtocol, PROTOCOL_VERSION } from "@vindicate/protocol";

const payload = parseProtocol(JobCreateRequestSchema, input, "job create request");
```

## Validation strategy

- Zod schemas are the runtime source of truth.
- TypeScript types are inferred from schemas.
- Boundary parsing should use `parseProtocol` or `safeParseProtocol`.

## Versioning policy

- `patch`: additive, backward-compatible schema changes
- `minor`: backward-compatible feature additions
- `major`: breaking contract changes

Current protocol version: `1.0.0` (`PROTOCOL_VERSION`).

Consumers must stay within compatibility ranges declared in `PROTOCOL_COMPATIBILITY_MATRIX`.

## Ownership rules

- Apps must import boundary contracts from `@vindicate/protocol`.
- Do not duplicate protocol shapes in app-local type files.
- Breaking changes require protocol version bump and ADR update.

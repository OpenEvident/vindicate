# @vindicate/protocol

Shared Zod contracts for Vindicate's local runtime and MCP boundaries.

## Scope

This package owns cross-service contracts only:

- runtime/worker command envelopes
- browser sessions, structured locators, and recording artifacts
- MCP tool request/response envelopes
- shared error model and protocol versioning

This package does **not** own service business logic, persistence, or transport implementation.

The `control-api/` and `skills-service/` exports are legacy compatibility schemas. They are not
used by the current local runtime.

## Usage

```ts
import {
  BrowserCreateSessionBodySchema,
  parseProtocol,
  PROTOCOL_VERSION
} from "@vindicate/protocol";

const payload = parseProtocol(BrowserCreateSessionBodySchema, input, "browser session request");
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

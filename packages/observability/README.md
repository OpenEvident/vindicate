# `@vindicate/observability`

Shared **structured logging** for Vindicate apps using [Pino](https://github.com/pinojs/pino).

## Usage

```typescript
import { createVindicateLogger } from "@vindicate/observability";

const logger = createVindicateLogger({ service: "my-app" });

logger.info({ requestId: "abc" }, "handled request");
logger.error({ err }, "request failed");
```

## Behavior

- **JSON** to **stderr** by default (keeps **stdout** clean for MCP stdio and subprocess tooling).
  Logs can also be written to a local file with `VINDICATE_LOG_FILE`.
- **`LOG_LEVEL`**: `trace` | `debug` | `info` | `warn` | `error` | `fatal` | `silent`. Invalid values default to `info`.
- **Redaction** of common secret field paths (`password`, `authorization`, `token`, `accessToken`, etc.) from merged log objects.
- **ISO timestamps** via Pino’s `isoTime` formatter.

## Later

Tracing and metrics (e.g. OpenTelemetry) can extend this package without changing each app’s import site.

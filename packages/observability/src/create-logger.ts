/**
 * @file Shared Pino factory: JSON logs, stderr by default, `LOG_LEVEL`, and redaction for common secret fields.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import pino, { type Logger, type LoggerOptions } from "pino";

const PINO_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

/** Paths redacted from merged log objects (tokens, cookies, passwords). */
const DEFAULT_REDACT_PATHS: string[] = [
  "password",
  "*.password",
  "authorization",
  "*.authorization",
  "*.headers.authorization",
  "*.headers['x-vindicate-internal-key']",
  "cookie",
  "*.cookie",
  "setCookie",
  "*.setCookie",
  "accessToken",
  "*.accessToken",
  "authToken",
  "*.authToken",
  "refreshToken",
  "*.refreshToken",
  "token",
  "*.token",
  "clientSecret",
  "*.clientSecret",
  "internalKey",
  "*.internalKey"
];

export type VindicateLoggerOptions = {
  /** Stable service name on every line (e.g. `runtime-worker`). */
  service: string;
  /** Pino level; defaults to `process.env.LOG_LEVEL` or `info`. Invalid values fall back to `info`. */
  level?: string;
  /**
   * When `true` (default), logs go to **stderr** so stdout stays free for subprocess pipes and MCP stdio.
   */
  useStderr?: boolean;
  /**
   * Absolute path to a `.log` file. When provided, logs are written to both stderr and this file
   * so testers can share a single log with the dev team.
   */
  logFile?: string;
};

function resolveLevel(explicit: string | undefined): string {
  const raw = (explicit ?? process.env.LOG_LEVEL ?? "info").toLowerCase().trim();
  return PINO_LEVELS.has(raw) ? raw : "info";
}

/**
 * Creates a root Pino logger for Vindicate apps (JSON, ISO timestamps, redaction).
 *
 * @remarks
 * Prefer **object-first** calls: `logger.info({ key: "v" }, "message")` so fields merge predictably.
 * Use `.child({ ... })` for per-request or per-command bindings (operation id, trace id later).
 */
export function createVindicateLogger(options: VindicateLoggerOptions): Logger {
  const { service, level: levelOpt, useStderr = true, logFile } = options;
  const level = resolveLevel(levelOpt);

  const pinoOptions: LoggerOptions = {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      remove: true
    }
  };

  if (logFile) {
    mkdirSync(path.dirname(logFile), { recursive: true });
    return pino(
      pinoOptions,
      pino.multistream([
        { stream: pino.destination({ fd: useStderr ? 2 : 1, sync: false }) },
        { stream: pino.destination({ dest: logFile, sync: false }) }
      ])
    );
  }

  return pino(pinoOptions, pino.destination({ fd: useStderr ? 2 : 1, sync: false }));
}

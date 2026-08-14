/**
 * @file Validated environment — fails at import time when required vars are missing.
 * Loads `.env` then `.env.local` from the process cwd (package or monorepo root).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createEnv } from "@t3-oss/env-core";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const cwd = process.cwd();

function loadEnvDir(baseDir: string, cwdOverrides: boolean): void {
  const envPath = path.join(baseDir, ".env");
  const localPath = path.join(baseDir, ".env.local");
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: cwdOverrides });
  }
  if (existsSync(localPath)) {
    loadDotenv({ path: localPath, override: true });
  }
}

loadEnvDir(packageRoot, false);
if (cwd !== packageRoot) {
  loadEnvDir(cwd, true);
}

export const config = createEnv({
  server: {
    VINDICATE_INTERNAL_KEY: z.string().min(32),
    VINDICATE_WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(9121),
    VINDICATE_SESSION_ENCRYPT: z.coerce.boolean().default(false),
    VINDICATE_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
    VINDICATE_SESSION_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
    VINDICATE_MAX_FILE_BYTES: z.coerce.number().int().positive().default(1_048_576),
    VINDICATE_MAX_OUTPUT_CHARS: z.coerce.number().int().positive().default(50_000),
    VINDICATE_SNAPSHOT_MAX_NODES: z.coerce.number().int().positive().default(500),
    VINDICATE_SNAPSHOT_MAX_HTML_BYTES: z.coerce.number().int().positive().default(102_400),
    VINDICATE_SNAPSHOT_DESCRIPTOR_CAP: z.coerce.number().int().positive().default(2_000),
    VINDICATE_READ_SETTLE_MS: z.coerce.number().int().nonnegative().default(700),
    VINDICATE_SETTLE_NETWORK_MS: z.coerce.number().int().nonnegative().default(5_000),
    VINDICATE_SETTLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    VINDICATE_ACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    VINDICATE_ACTION_TIMEOUT_MAX_MS: z.coerce.number().int().positive().default(120_000),
    VINDICATE_CONSOLE_BUFFER_SIZE: z.coerce.number().int().positive().default(500),
    VINDICATE_NETWORK_BUFFER_SIZE: z.coerce.number().int().positive().default(500),
    VINDICATE_ACTION_LOG_SIZE: z.coerce.number().int().positive().default(1000),
    VINDICATE_DELTA_CACHE_SIZE: z.coerce.number().int().nonnegative().default(5),
    VINDICATE_SESSION_PAUSED_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    /**
     * The worker is a machine-wide singleton shared by every editor window. It
     * self-terminates after this much idle time (no health pings) with zero
     * active/paused browser sessions, so it doesn't run forever once started.
     */
    VINDICATE_IDLE_SHUTDOWN_MS: z.coerce.number().int().positive().default(300_000),
    VINDICATE_MAX_CPU_PCT: z.coerce.number().int().min(1).max(100).default(100),
    VINDICATE_MAX_MEMORY_PCT: z.coerce.number().int().min(1).max(100).default(100),
    VINDICATE_REJECT_CPU_PCT: z.coerce.number().int().min(1).max(100).default(100),
    VINDICATE_REJECT_MEMORY_PCT: z.coerce.number().int().min(1).max(100).default(100),
    VINDICATE_EVENTS_BUFFER_SIZE: z.coerce.number().int().positive().default(200),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "silent"]).default("info"),
    VINDICATE_LOG_FILE: z.string().optional()
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
});

export type Config = typeof config;

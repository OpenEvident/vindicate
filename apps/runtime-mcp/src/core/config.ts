/**
 * @file Validated environment — fails at import time when required vars are missing.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { UrlSchema } from "@vindicate/protocol";
import { createEnv } from "@t3-oss/env-core";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const cwd = process.cwd();
if (existsSync(path.join(cwd, ".env"))) {
  loadDotenv({ path: path.join(cwd, ".env") });
}
if (existsSync(path.join(cwd, ".env.local"))) {
  loadDotenv({ path: path.join(cwd, ".env.local"), override: true });
}

/** Env kill-switch for browser_diagnose — stringbool so "false" is not truthy. */
export const VindicateVisualDiagnosisSchema = z.stringbool().default(true);

export const config = createEnv({
  server: {
    VINDICATE_MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(9223),
    VINDICATE_WORKER_URL: UrlSchema.default("http://127.0.0.1:9121"),
    VINDICATE_INTERNAL_KEY: z.string().min(32),
    VINDICATE_PROJECT_ROOT: z.string().min(1),
    CLAUDE_PROJECT_DIR: z.string().optional(),
    VINDICATE_WORKER_RETRY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    VINDICATE_WORKER_HEALTH_PROBE_MS: z.coerce.number().int().positive().default(2_000),
    VINDICATE_LOG_FILE: z.string().optional(),
    VINDICATE_MAX_FILE_BYTES: z.coerce.number().int().positive().default(1_048_576),
    VINDICATE_VISUAL_DIAGNOSIS: VindicateVisualDiagnosisSchema,
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "silent"]).default("info")
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
});

export type Config = typeof config;

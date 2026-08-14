/**
 * Control API run records: Playwright executions linked to jobs and stored artifacts.
 */
import { z } from "zod";

import { IsoDateTimeSchema, UuidSchema } from "../common/ids.js";

/** Terminal outcome for a single test run. */
export const RunOutcomeSchema = z.enum(["passed", "failed", "cancelled", "skipped"]);

/** Pointer to an artifact produced during a run (screenshot, trace, report, etc.). */
export const ArtifactRefSchema = z.object({
  kind: z.enum(["screenshot", "snapshot", "report", "trace", "log", "other"]),
  uri: z.string().min(1).max(2048),
  contentType: z.string().min(1).max(128).optional(),
  bytes: z.number().int().nonnegative().optional()
});

/** Start a run for a job with trigger source and optional command or env overrides. */
export const RunCreateRequestSchema = z.object({
  jobId: UuidSchema,
  trigger: z.enum(["manual", "healer", "ci", "mcp"]).default("mcp"),
  command: z.string().min(1).max(1024).optional(),
  environment: z.record(z.string(), z.string()).optional()
});

/** Persisted run with timing, summary, and artifact list. */
export const RunRecordSchema = z.object({
  runId: UuidSchema,
  jobId: UuidSchema,
  outcome: RunOutcomeSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  summary: z.string().max(4000).optional(),
  artifacts: z.array(ArtifactRefSchema).default([])
});

export type RunOutcome = z.infer<typeof RunOutcomeSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type RunCreateRequest = z.infer<typeof RunCreateRequestSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;

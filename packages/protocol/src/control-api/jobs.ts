/**
 * Control API job lifecycle: workflow-bound work units and minion phase checkpoints.
 */
import { z } from "zod";

import { IsoDateTimeSchema, UuidSchema } from "../common/ids.js";

/** Ordered minion phases from intake through completion or failure. */
export const JobPhaseSchema = z.enum([
  "intake",
  "plan",
  "explore",
  "generate",
  "run",
  "heal",
  "audit",
  "done",
  "failed"
]);

/** Progress state for a single phase checkpoint on a job. */
export const JobCheckpointStatusSchema = z.enum(["pending", "doing", "done", "blocked"]);

/** One checkpoint row: phase, status, optional note, and artifact references. */
export const JobCheckpointSchema = z.object({
  phase: JobPhaseSchema,
  status: JobCheckpointStatusSchema,
  at: IsoDateTimeSchema.optional(),
  note: z.string().max(4000).optional(),
  artifactRefs: z.array(z.string().min(1).max(512)).default([])
});

/** Create a job for a project with workflow version, intent, and objective text. */
export const JobCreateRequestSchema = z.object({
  projectId: UuidSchema,
  objective: z.string().min(1).max(8000),
  source: z.enum(["prompt", "ticket", "cli", "ide"]).default("prompt"),
  workflowId: z.string().min(1).max(128),
  workflowVersion: z.string().min(1).max(64),
  intent: z.string().min(1).max(64)
});

/** Persisted job record including current phase and checkpoint history. */
export const JobRecordSchema = z.object({
  jobId: UuidSchema,
  projectId: UuidSchema,
  phase: JobPhaseSchema,
  objective: z.string().min(1).max(8000),
  workflowId: z.string().min(1).max(128),
  workflowVersion: z.string().min(1).max(64),
  intent: z.string().min(1).max(64),
  checkpoints: z.array(JobCheckpointSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

/** Update a checkpoint when a minion advances or blocks on a phase. */
export const JobCheckpointUpdateRequestSchema = z.object({
  phase: JobPhaseSchema,
  status: JobCheckpointStatusSchema,
  note: z.string().max(4000).optional(),
  artifactRefs: z.array(z.string().min(1).max(512)).optional()
});

export type JobPhase = z.infer<typeof JobPhaseSchema>;
export type JobCheckpoint = z.infer<typeof JobCheckpointSchema>;
export type JobCreateRequest = z.infer<typeof JobCreateRequestSchema>;
export type JobRecord = z.infer<typeof JobRecordSchema>;
export type JobCheckpointUpdateRequest = z.infer<typeof JobCheckpointUpdateRequestSchema>;

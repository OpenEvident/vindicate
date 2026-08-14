/**
 * Local runtime health and aggregate status for MCP and worker readiness.
 */
import { z } from "zod";

import { UuidSchema } from "../common/ids.js";

/** Liveness response from a runtime HTTP health endpoint. */
export const RuntimeHealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string().min(1).max(128),
  version: z.string().min(1).max(64).optional(),
  protocolVersion: z.string().min(1).max(32).optional()
});

/** Snapshot of MCP listener, worker, auth, and optional active job. */
export const RuntimeStatusSchema = z.object({
  mcpListening: z.boolean(),
  workerReady: z.boolean(),
  authenticated: z.boolean(),
  currentJobId: UuidSchema.optional()
});

export type RuntimeHealthResponse = z.infer<typeof RuntimeHealthResponseSchema>;
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

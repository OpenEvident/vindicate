/**
 * Skills service sessions: scoped access to workflow packs and search with rate limits.
 */
import { z } from "zod";

import { IsoDateTimeSchema, UuidSchema } from "../common/ids.js";

/** Open a session for a workflow version and intent, optionally tied to a job or project. */
export const WorkflowSessionCreateRequestSchema = z.object({
  workflowId: z.string().min(1).max(128),
  workflowVersion: z.string().min(1).max(64),
  intent: z.string().min(1).max(64),
  jobId: UuidSchema.optional(),
  projectId: UuidSchema.optional()
});

/** Per-session caps enforced by the skills service on pack and search calls. */
export const WorkflowSessionLimitsSchema = z.object({
  maxPackRequests: z.number().int().min(1).max(1000),
  maxSliceTokensPerRequest: z.number().int().min(256).max(65536),
  maxSearchResults: z.number().int().min(1).max(100)
});

/** Issued session id, expiry, and limits after successful session creation. */
export const WorkflowSessionCreateResponseSchema = z.object({
  sessionId: UuidSchema,
  workflowId: z.string().min(1).max(128),
  workflowVersion: z.string().min(1).max(64),
  intent: z.string().min(1).max(64),
  expiresAt: IsoDateTimeSchema,
  limits: WorkflowSessionLimitsSchema
});

export type WorkflowSessionCreateRequest = z.infer<typeof WorkflowSessionCreateRequestSchema>;
export type WorkflowSessionLimits = z.infer<typeof WorkflowSessionLimitsSchema>;
export type WorkflowSessionCreateResponse = z.infer<typeof WorkflowSessionCreateResponseSchema>;

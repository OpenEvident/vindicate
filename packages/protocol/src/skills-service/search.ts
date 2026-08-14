/**
 * Skills service semantic search over workflow content within a session token budget.
 */
import { z } from "zod";

import { UuidSchema } from "../common/ids.js";

import { TruncationSummarySchema } from "./packs.js";

/** Search query, result count, token budget, and optional section filter. */
export const WorkflowSearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(20).default(5),
  budgetTokens: z.number().int().min(256).max(65536).default(1500),
  sectionFilter: z.array(z.string().min(1).max(128)).optional()
});

/** One ranked chunk with heading path and estimated token cost. */
export const WorkflowSearchChunkSchema = z.object({
  chunkId: z.string().min(1).max(256),
  sectionId: z.string().min(1).max(128),
  anchor: z.string().min(1).max(128),
  headingPath: z.string().min(1).max(512),
  text: z.string().min(1).max(50_000),
  score: z.number().nonnegative(),
  estTokens: z.number().int().nonnegative()
});

/** Search hits, truncation summary, optional reminder, and delivery id. */
export const WorkflowSearchResponseSchema = z.object({
  sessionId: UuidSchema,
  query: z.string().min(1).max(2000),
  chunks: z.array(WorkflowSearchChunkSchema),
  truncationSummary: TruncationSummarySchema,
  reminder: z.string().min(1).max(512).optional(),
  deliveryId: UuidSchema
});

export type WorkflowSearchRequest = z.infer<typeof WorkflowSearchRequestSchema>;
export type WorkflowSearchChunk = z.infer<typeof WorkflowSearchChunkSchema>;
export type WorkflowSearchResponse = z.infer<typeof WorkflowSearchResponseSchema>;

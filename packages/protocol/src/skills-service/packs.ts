/**
 * Skills service workflow packs: outline or full section delivery with token budgets.
 */
import { z } from "zod";

import { UuidSchema } from "../common/ids.js";

/** Request outline summaries only or full section bodies. */
export const WorkflowPackModeSchema = z.enum(["outline", "full"]);

/** One workflow section with optional outline bullets or full body text. */
export const WorkflowPackSectionSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(512),
  anchor: z.string().min(1).max(128),
  estTokens: z.number().int().nonnegative(),
  outline: z.array(z.string().min(1).max(512)).optional(),
  body: z.string().max(200_000).optional()
});

/** Explains when content was truncated to respect session token limits. */
export const TruncationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  reason: z.string().min(1).max(256)
});

/** Select pack mode, core sections, and optional section id filter. */
export const WorkflowPackRequestSchema = z.object({
  mode: WorkflowPackModeSchema.default("outline"),
  includeCore: z.boolean().default(true),
  sectionIds: z.array(z.string().min(1).max(128)).optional()
});

/** Pack payload returned to the model host with delivery id for audit. */
export const WorkflowPackResponseSchema = z.object({
  sessionId: UuidSchema,
  intent: z.string().min(1).max(64),
  mode: WorkflowPackModeSchema,
  workflowVersion: z.string().min(1).max(64),
  sections: z.array(WorkflowPackSectionSchema),
  totalEstTokens: z.number().int().nonnegative(),
  missing: z.array(z.string().min(1).max(128)).default([]),
  truncationSummary: TruncationSummarySchema.optional(),
  deliveryId: UuidSchema
});

export type WorkflowPackMode = z.infer<typeof WorkflowPackModeSchema>;
export type WorkflowPackSection = z.infer<typeof WorkflowPackSectionSchema>;
export type WorkflowPackRequest = z.infer<typeof WorkflowPackRequestSchema>;
export type WorkflowPackResponse = z.infer<typeof WorkflowPackResponseSchema>;
export type TruncationSummary = z.infer<typeof TruncationSummarySchema>;

/**
 * Skills service workflow registry: graph definitions and node packs.
 */
import { z } from "zod";

/** Workflow entry in a catalog list (id, latest version). */
export const WorkflowSummarySchema = z.object({
  id: z.string().min(1).max(128),
  latestVersion: z.string().min(1).max(64),
  intents: z.array(z.string().min(1).max(64))
});

/** Response body for listing available workflows. */
export const WorkflowListResponseSchema = z.object({
  workflows: z.array(WorkflowSummarySchema)
});

/** Resolved workflow metadata including content digest for integrity checks. */
export const WorkflowResolveResponseSchema = z.object({
  workflowId: z.string().min(1).max(128),
  version: z.string().min(1).max(64),
  bundleDigest: z.string().regex(/^sha256:[A-Fa-f0-9]{8,128}$/),
  intents: z.array(z.string().min(1).max(64))
});

export const GraphTransitionSchema = z.object({
  to: z.string().min(1).max(64),
  when: z.string().min(1).max(256).optional()
});

export const GraphNodeDefSchema = z.object({
  nodeId: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  required: z.boolean(),
  refs: z.array(z.string().min(1).max(64)),
  panel: z.string().min(1).max(64).optional(),
  transitions: z.array(GraphTransitionSchema)
});

export const WorkflowGraphSchema = z.object({
  graphId: z.string().min(1).max(64),
  version: z.number().int().positive(),
  description: z.string().min(1).max(512),
  nodes: z.record(z.string(), GraphNodeDefSchema)
});

export const NodePackSectionSchema = z.object({
  sectionId: z.string().min(1).max(128),
  content: z.string(),
  estTokens: z.number().int().nonnegative()
});

export const NodePackSchema = z.object({
  nodeId: z.string().min(1).max(64),
  graphId: z.string().min(1).max(64),
  sections: z.array(NodePackSectionSchema),
  total_tokens: z.number().int().nonnegative(),
  required_tools: z.array(z.string().min(1).max(64)),
  forbidden_tools: z.array(z.string().min(1).max(64)),
  allowed_write_paths: z.array(z.string().min(1).max(256)).optional(),
  checkpoint_criteria: z.string().min(1).max(4096),
  required_checkpoint_fields: z.array(z.string().min(1).max(64)),
  deliveryId: z.string().uuid()
});

export type WorkflowSummary = z.infer<typeof WorkflowSummarySchema>;
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>;
export type WorkflowResolveResponse = z.infer<typeof WorkflowResolveResponseSchema>;
export type GraphTransition = z.infer<typeof GraphTransitionSchema>;
export type GraphNodeDef = z.infer<typeof GraphNodeDefSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type NodePackSection = z.infer<typeof NodePackSectionSchema>;
export type NodePack = z.infer<typeof NodePackSchema>;

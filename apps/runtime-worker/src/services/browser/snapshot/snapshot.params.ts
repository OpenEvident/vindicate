/**
 * @file Zod schema for snapshot command steps (BROWSER-SERVICE §1.2).
 */
import { z } from "zod";

export const SnapshotScopeSchema = z.union([
  z.object({ ref: z.string().min(1) }),
  z.object({ css: z.string().min(1) })
]);

export const SnapshotParamsSchema = z.object({
  mode: z.enum(["interactive"]).default("interactive"),
  delta: z.object({ since_snapshot_id: z.number().int().nonnegative() }).optional(),
  scope: SnapshotScopeSchema.optional(),
  viewport_only: z.boolean().optional(),
  max_nodes: z.number().int().positive().optional(),
  collapse: z.boolean().optional(),
  include_verifiable: z.boolean().optional(),
  /** Skip the default pre-capture quiet-window settle (for speed when freshness isn't needed). */
  no_settle: z.boolean().optional()
});

export type SnapshotParams = z.infer<typeof SnapshotParamsSchema>;
export type SnapshotScope = z.infer<typeof SnapshotScopeSchema>;

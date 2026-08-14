/**
 * Browser state drift: response when an action expects a snapshot id that no longer matches.
 */
import { z } from "zod";

/** Tells the caller to refresh browser state (typically via snapshot) before retrying. */
export const StateDriftResponseSchema = z.object({
  status: z.literal("state_drift"),
  expectedStateId: z.string().min(1).max(64),
  actualStateId: z.string().min(1).max(64),
  suggestion: z.string().min(1).max(512).default("call browser_read first")
});

export type StateDriftResponse = z.infer<typeof StateDriftResponseSchema>;

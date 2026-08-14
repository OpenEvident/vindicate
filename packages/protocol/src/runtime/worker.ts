/**
 * Local browser worker command protocol: Playwright and project file operations.
 */
import { z } from "zod";

/** Supported worker operations invoked by the MCP runtime over IPC or HTTP. */
export const WorkerOperationSchema = z.enum([
  "health",
  "navigate",
  "snapshot",
  "click",
  "type",
  "project_read_text",
  "project_write_text"
]);

/** Command envelope: operation name and operation-specific params map. */
export const WorkerCommandRequestSchema = z.object({
  operation: WorkerOperationSchema,
  params: z.record(z.string(), z.unknown()).default({})
});

/** Successful worker response with arbitrary operation-specific payload. */
export const WorkerCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.unknown()
});

/** Failed worker response with a human-readable error string. */
export const WorkerCommandFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1).max(4000)
});

/** Discriminated union on `ok` for typed success vs failure handling. */
export const WorkerCommandResponseSchema = z.discriminatedUnion("ok", [
  WorkerCommandSuccessSchema,
  WorkerCommandFailureSchema
]);

export type WorkerOperation = z.infer<typeof WorkerOperationSchema>;
export type WorkerCommandRequest = z.infer<typeof WorkerCommandRequestSchema>;
export type WorkerCommandResponse = z.infer<typeof WorkerCommandResponseSchema>;

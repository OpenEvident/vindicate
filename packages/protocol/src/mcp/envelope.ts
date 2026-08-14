/**
 * MCP tool call envelopes: normalized request and success/error responses around tool I/O.
 */
import { z } from "zod";

import { CorrelationIdSchema } from "../common/ids.js";
import { ProtocolErrorEnvelopeSchema } from "../errors/envelope.js";

/** Inbound tool invocation with arguments and optional protocol version. */
export const McpToolRequestEnvelopeSchema = z.object({
  tool: z.string().min(1).max(128),
  arguments: z.record(z.string(), z.unknown()).default({}),
  correlationId: CorrelationIdSchema.optional(),
  protocolVersion: z.string().min(1).max(32).optional()
});

/** Successful tool result wrapped with tool name and optional correlation id. */
export const McpToolSuccessEnvelopeSchema = z.object({
  ok: z.literal(true),
  tool: z.string().min(1).max(128),
  result: z.unknown(),
  correlationId: CorrelationIdSchema.optional()
});

/** Failed tool call using the shared {@link ProtocolErrorEnvelopeSchema}. */
export const McpToolErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  tool: z.string().min(1).max(128),
  error: ProtocolErrorEnvelopeSchema,
  correlationId: CorrelationIdSchema.optional()
});

/** Discriminated union on `ok` for MCP tool responses. */
export const McpToolResponseEnvelopeSchema = z.discriminatedUnion("ok", [
  McpToolSuccessEnvelopeSchema,
  McpToolErrorEnvelopeSchema
]);

export type McpToolRequestEnvelope = z.infer<typeof McpToolRequestEnvelopeSchema>;
export type McpToolResponseEnvelope = z.infer<typeof McpToolResponseEnvelopeSchema>;

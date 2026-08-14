/**
 * Unified error codes and response envelope for all Vindicate protocol surfaces.
 */
import { z } from "zod";

/** Machine-readable error taxonomy shared by cloud APIs, MCP, and local runtime. */
export const ProtocolErrorCodeSchema = z.enum([
  "auth.unauthorized",
  "auth.invalid_token",
  "auth.session_expired",
  "validation.invalid_payload",
  "validation.unknown_intent",
  "resource.not_found",
  "resource.conflict",
  "workflow.invalid_phase_transition",
  "workflow.checkpoint_missing",
  "runtime.state_drift",
  "runtime.unavailable",
  "transient.upstream_timeout",
  "transient.rate_limited",
  "internal.unexpected"
]);

/** Standard error body: code, message, optional details, and retry hint. */
export const ProtocolErrorEnvelopeSchema = z.object({
  code: ProtocolErrorCodeSchema,
  message: z.string().min(1).max(2000),
  details: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().min(1).max(128).optional(),
  retryable: z.boolean().default(false)
});

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;
export type ProtocolErrorEnvelope = z.infer<typeof ProtocolErrorEnvelopeSchema>;

/** Whether callers should retry after backoff for this error code. */
export function isRetryableErrorCode(code: ProtocolErrorCode): boolean {
  return (
    code === "transient.upstream_timeout" ||
    code === "transient.rate_limited" ||
    code === "runtime.unavailable"
  );
}

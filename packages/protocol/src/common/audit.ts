/**
 * Cross-cutting audit and tenancy context attached to control-plane and skills payloads.
 */
import { z } from "zod";

import { CorrelationIdSchema, IsoDateTimeSchema, UuidSchema } from "./ids.js";

/** Creation and update timestamps plus optional correlation for tracing. */
export const AuditMetadataSchema = z.object({
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema.optional(),
  correlationId: CorrelationIdSchema.optional()
});

/** Who initiated an action (user, installation, or client surface). */
export const ActorContextSchema = z.object({
  userId: UuidSchema.optional(),
  installationId: UuidSchema.optional(),
  client: z.enum(["cli", "cursor", "claude", "vscode", "ci", "other"]).optional()
});

/** Workspace and optional project scope for multi-tenant APIs. */
export const TenantContextSchema = z.object({
  workspaceId: UuidSchema,
  projectId: UuidSchema.optional()
});

export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;
export type ActorContext = z.infer<typeof ActorContextSchema>;
export type TenantContext = z.infer<typeof TenantContextSchema>;

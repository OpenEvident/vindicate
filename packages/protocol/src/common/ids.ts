/**
 * Canonical identifier and timestamp formats shared across Vindicate protocol boundaries.
 */
import { z } from "zod";

/** ISO-8601 timestamp with timezone offset, used for audit and lifecycle fields. */
export const IsoDateTimeSchema = z.iso.datetime({
  offset: true,
  message: "expected ISO-8601 datetime with offset"
});

/** End-to-end request id propagated across CLI, MCP, cloud APIs, and workers. */
export const CorrelationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "invalid correlation id format");

/** RFC 4122 UUID string for platform and Vindicate entity identifiers. */
export const UuidSchema = z.uuid({ message: "expected a UUID" });

/** Absolute URL string (Zod v4 top-level validator; prefer over deprecated `z.string().url()`). */
export const UrlSchema = z.url({ message: "expected a valid URL" });

export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type Uuid = z.infer<typeof UuidSchema>;
export type UrlString = z.infer<typeof UrlSchema>;
export type UserId = Uuid;
export type WorkspaceId = Uuid;
export type ProjectId = Uuid;
export type InstallationId = Uuid;
export type JobId = Uuid;
export type RunId = Uuid;
export type WorkflowSessionId = Uuid;
export type DeliveryId = Uuid;

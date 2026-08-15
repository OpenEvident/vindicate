/**
 * @file HTTP contracts for browser session lifecycle (runtime-worker ↔ MCP).
 */
import { z } from "zod";

import { UrlSchema, UuidSchema } from "../common/ids.js";

export const BrowserCreateSessionBodySchema = z.object({
  name: z.string().min(1).max(512),
  description: z.string().max(4000).optional(),
  url: UrlSchema,
  project_root: z.string().min(1),
  testid_attr: z.string().min(1).optional(),
  viewport: z
    .object({
      width: z.number().int().positive().max(7680),
      height: z.number().int().positive().max(4320)
    })
    .optional(),
  headless: z.boolean().optional()
});

export const BrowserCreateSessionResponseSchema = z.object({
  session_id: UuidSchema,
  name: z.string(),
  status: z.enum(["active", "paused", "dead", "expired", "closed"])
});

export const BrowserSessionListItemSchema = z.object({
  session_id: UuidSchema,
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(["active", "dead"]),
  resumable: z.boolean().optional(),
  url: z.string(),
  created_at: z.string(),
  last_active_at: z.string()
});

export const BrowserResumeBodySchema = z.object({
  restore_auth: z.boolean().optional(),
  navigate_to_last_url: z.boolean().optional()
});

export type BrowserCreateSessionBody = z.infer<typeof BrowserCreateSessionBodySchema>;
export type BrowserCreateSessionResponse = z.infer<typeof BrowserCreateSessionResponseSchema>;
export type BrowserSessionListItem = z.infer<typeof BrowserSessionListItemSchema>;
export type BrowserResumeBody = z.infer<typeof BrowserResumeBodySchema>;

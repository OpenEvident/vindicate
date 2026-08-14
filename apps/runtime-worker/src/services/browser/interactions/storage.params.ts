/**
 * @file Zod schemas for cookie/storage command steps (BROWSER-SERVICE §7).
 */
import { UrlSchema } from "@vindicate/protocol";
import { z } from "zod";

export const CookieParamSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  url: UrlSchema.optional(),
  domain: z.string().optional(),
  path: z.string().optional(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional()
});

export const GetCookiesStepSchema = z.object({
  action: z.literal("get_cookies"),
  url: UrlSchema.optional()
});

export const SetCookiesStepSchema = z.object({
  action: z.literal("set_cookies"),
  cookies: z.array(CookieParamSchema).min(1)
});

export const ClearCookiesStepSchema = z.object({
  action: z.literal("clear_cookies"),
  url: UrlSchema.optional()
});

export const StorageTypeSchema = z.enum(["local", "session"]);

export const GetStorageStepSchema = z.object({
  action: z.literal("get_storage"),
  origin: UrlSchema,
  type: StorageTypeSchema,
  key: z.string().min(1).optional()
});

export const SetStorageStepSchema = z.object({
  action: z.literal("set_storage"),
  origin: UrlSchema,
  type: StorageTypeSchema,
  key: z.string().min(1),
  value: z.string()
});

export const ClearStorageStepSchema = z.object({
  action: z.literal("clear_storage"),
  origin: UrlSchema,
  type: StorageTypeSchema
});

export const PauseForHumanStepSchema = z.object({
  action: z.literal("pause_for_human"),
  message: z.string().min(1),
  record: z.boolean().optional()
});

export type GetCookiesStep = z.infer<typeof GetCookiesStepSchema>;
export type SetCookiesStep = z.infer<typeof SetCookiesStepSchema>;
export type ClearCookiesStep = z.infer<typeof ClearCookiesStepSchema>;
export type GetStorageStep = z.infer<typeof GetStorageStepSchema>;
export type SetStorageStep = z.infer<typeof SetStorageStepSchema>;
export type ClearStorageStep = z.infer<typeof ClearStorageStepSchema>;
export type PauseForHumanStep = z.infer<typeof PauseForHumanStepSchema>;

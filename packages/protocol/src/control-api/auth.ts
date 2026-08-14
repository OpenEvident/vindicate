/**
 * Platform Auth (`/auth/v1`) device OAuth and token payloads.
 *
 * Field names follow the auth service wire format (snake_case). Browser login,
 * registration, and profile routes are defined in portal-ui and are out of scope here.
 */
import { z } from "zod";

import { UrlSchema, UuidSchema } from "../common/ids.js";

/** Client kind reported when starting device authorization. */
export const AuthDeviceClientTypeSchema = z.enum(["cli", "mcp", "ide", "ci", "other"]);

/** `POST /auth/v1/oauth/device/code` multipart form fields. */
export const AuthDeviceCodeRequestSchema = z.object({
  installation_id: UuidSchema,
  client_type: AuthDeviceClientTypeSchema.optional(),
  device_label: z.string().min(1).max(120).optional()
});

/** Raw JSON body from `POST /auth/v1/oauth/device/code`. */
export const AuthDeviceCodeResponseSchema = z.object({
  device_code: z.string().min(8).max(256),
  user_code: z.string().min(4).max(32),
  verification_uri: UrlSchema,
  verification_uri_complete: UrlSchema,
  expires_in: z.number().int().min(1),
  interval: z.number().int().min(1).max(60)
});

/** `POST /auth/v1/oauth/token` multipart form fields. */
export const AuthDeviceTokenRequestSchema = z.object({
  grant_type: z.string().min(1),
  device_code: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional()
});

/** Successful `POST /auth/v1/oauth/token` response body. */
export const AuthDeviceTokenSuccessSchema = z.object({
  access_token: z.string().min(16),
  refresh_token: z.string().min(16),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(1),
  scope: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional(),
  profile_picture_url: UrlSchema.optional()
});

/** Failed `POST /auth/v1/oauth/token` response body (RFC 6749 error shape). */
export const AuthDeviceTokenErrorSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().min(1)
});

/** `POST /auth/v1/oauth/device/approve` JSON body. */
export const AuthDeviceApproveRequestSchema = z.object({
  user_code: z.string().min(1).max(32)
});

/** `data` payload for a successful device approve response. */
export const AuthDeviceApproveDataSchema = z.object({
  installation_id: UuidSchema
});

/** Standard auth service envelope used by device approve. */
export const AuthDeviceApproveResponseSchema = z.object({
  status_code: z.number().int(),
  message: z.string().nullable().optional(),
  data: AuthDeviceApproveDataSchema.nullable().optional()
});

/** `POST /auth/v1/tokens/refresh` JSON body (browser and shared refresh path). */
export const AuthTokenRefreshRequestSchema = z.object({
  refresh_token: z.string().min(16)
});

/** `POST /auth/v1/tokens/refresh` success payload inside `ApiResponse.data`. */
export const AuthTokenRefreshResponseSchema = z.object({
  access_token: z.string().min(16),
  refresh_token: z.string().min(16),
  expires_in: z.number().int().min(1),
  token_type: z.literal("Bearer")
});

export type AuthDeviceClientType = z.infer<typeof AuthDeviceClientTypeSchema>;
export type AuthDeviceCodeRequest = z.infer<typeof AuthDeviceCodeRequestSchema>;
export type AuthDeviceCodeResponse = z.infer<typeof AuthDeviceCodeResponseSchema>;
export type AuthDeviceTokenRequest = z.infer<typeof AuthDeviceTokenRequestSchema>;
export type AuthDeviceTokenSuccess = z.infer<typeof AuthDeviceTokenSuccessSchema>;
export type AuthDeviceTokenError = z.infer<typeof AuthDeviceTokenErrorSchema>;
export type AuthDeviceApproveRequest = z.infer<typeof AuthDeviceApproveRequestSchema>;
export type AuthDeviceApproveData = z.infer<typeof AuthDeviceApproveDataSchema>;
export type AuthDeviceApproveResponse = z.infer<typeof AuthDeviceApproveResponseSchema>;
export type AuthTokenRefreshRequest = z.infer<typeof AuthTokenRefreshRequestSchema>;
export type AuthTokenRefreshResponse = z.infer<typeof AuthTokenRefreshResponseSchema>;

import { describe, expect, it } from "vitest";

import {
  AuthDeviceApproveResponseSchema,
  AuthDeviceCodeResponseSchema,
  AuthDeviceTokenErrorSchema,
  AuthDeviceTokenSuccessSchema,
  JobCreateRequestSchema,
  JobRecordSchema
} from "../../src/index.js";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const jobId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const installationId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("control-api contracts", () => {
  it("parses job create request", () => {
    const parsed = JobCreateRequestSchema.parse({
      projectId,
      objective: "Add login tests",
      workflowId: "vindicate-qa-playwright",
      workflowVersion: "2.4.0",
      intent: "add_feature"
    });
    expect(parsed.intent).toBe("add_feature");
  });

  it("keeps optional checkpoint fields backward compatible", () => {
    const parsed = JobRecordSchema.parse({
      jobId,
      projectId,
      phase: "explore",
      objective: "Add login tests",
      workflowId: "vindicate-qa-playwright",
      workflowVersion: "2.4.0",
      intent: "add_feature",
      createdAt: "2026-05-12T10:00:00Z",
      updatedAt: "2026-05-12T10:05:00Z"
    });
    expect(parsed.checkpoints).toEqual([]);
  });

  it("parses platform device code response", () => {
    const parsed = AuthDeviceCodeResponseSchema.parse({
      device_code: "device-code-secret",
      user_code: "ABCD-EFGH",
      verification_uri: "https://portal.example.com/device/activate",
      verification_uri_complete: "https://portal.example.com/device/activate?user_code=ABCD-EFGH",
      expires_in: 600,
      interval: 5
    });
    expect(parsed.interval).toBe(5);
  });

  it("parses platform device token success and error bodies", () => {
    const success = AuthDeviceTokenSuccessSchema.parse({
      access_token: "access-token-value-1234",
      refresh_token: "refresh-token-value-1234",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "device"
    });
    expect(success.scope).toBe("device");

    const withProfile = AuthDeviceTokenSuccessSchema.parse({
      ...success,
      email: "user@example.com",
      name: "Jane Doe",
      profile_picture_url: "https://cdn.example.com/avatar.jpg"
    });
    expect(withProfile.email).toBe("user@example.com");

    const error = AuthDeviceTokenErrorSchema.parse({
      error: "authorization_pending",
      error_description: "The authorization request is still pending"
    });
    expect(error.error).toBe("authorization_pending");
  });

  it("parses platform device approve envelope", () => {
    const parsed = AuthDeviceApproveResponseSchema.parse({
      status_code: 200,
      message: "Device approved",
      data: {
        installation_id: installationId
      }
    });
    expect(parsed.data?.installation_id).toBe(installationId);
  });
});

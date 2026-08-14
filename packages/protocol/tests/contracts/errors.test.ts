import { describe, expect, it } from "vitest";

import { ProtocolErrorEnvelopeSchema, isRetryableErrorCode } from "../../src/index.js";

describe("error envelope", () => {
  it("parses a valid error envelope", () => {
    const parsed = ProtocolErrorEnvelopeSchema.parse({
      code: "auth.unauthorized",
      message: "Missing bearer token",
      retryable: false
    });
    expect(parsed.code).toBe("auth.unauthorized");
  });

  it("marks transient codes as retryable", () => {
    expect(isRetryableErrorCode("transient.rate_limited")).toBe(true);
    expect(isRetryableErrorCode("auth.unauthorized")).toBe(false);
  });
});

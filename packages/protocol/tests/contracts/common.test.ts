import { describe, expect, it } from "vitest";

import { parseProtocol, safeParseProtocol, UuidSchema } from "../../src/index.js";

const jobId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("common contracts", () => {
  it("accepts valid uuids", () => {
    const parsed = parseProtocol(UuidSchema, jobId);
    expect(parsed).toBe(jobId);
  });

  it("rejects invalid uuids", () => {
    const result = safeParseProtocol(UuidSchema, "job-01");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

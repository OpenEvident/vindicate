import { describe, expect, it } from "vitest";

import { McpToolResponseEnvelopeSchema, StateDriftResponseSchema } from "../../src/index.js";

describe("runtime and mcp contracts", () => {
  it("parses state drift response", () => {
    const parsed = StateDriftResponseSchema.parse({
      status: "state_drift",
      expectedStateId: "abc123",
      actualStateId: "def456"
    });
    expect(parsed.status).toBe("state_drift");
  });

  it("parses mcp tool error envelope", () => {
    const parsed = McpToolResponseEnvelopeSchema.parse({
      ok: false,
      tool: "browser_click",
      error: {
        code: "runtime.state_drift",
        message: "Page changed since last snapshot",
        retryable: false
      }
    });
    expect(parsed.ok).toBe(false);
  });
});

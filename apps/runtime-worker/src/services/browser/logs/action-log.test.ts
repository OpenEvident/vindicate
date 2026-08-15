import { describe, expect, it } from "vitest";

import { SessionActionLog, redactActionParams } from "./action-log.js";

describe("redactActionParams", () => {
  it("redacts sensitive keys", () => {
    const out = redactActionParams({
      ref: "ref-a3f9c2b1",
      password: "secret",
      nested: { api_key: "k" }
    });
    expect(out.ref).toBe("ref-a3f9c2b1");
    expect(out.password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
  });

  it("redacts value and prompt_text for fill/type steps", () => {
    const out = redactActionParams({
      ref: "ref-a3f9c2b1",
      value: "Test@1234",
      prompt_text: "yes"
    });
    expect(out.ref).toBe("ref-a3f9c2b1");
    expect(out.value).toBe("[REDACTED]");
    expect(out.prompt_text).toBe("[REDACTED]");
  });
});

describe("SessionActionLog", () => {
  it("evicts oldest entries when capacity is exceeded", () => {
    const log = new SessionActionLog(2);
    log.append("s1", {
      action: "click",
      params: { ref: "ref-00000001" },
      result: "success",
      duration_ms: 1
    });
    log.append("s1", {
      action: "type",
      params: { ref: "ref-00000002" },
      result: "success",
      duration_ms: 2
    });
    log.append("s1", {
      action: "navigate",
      params: { url: "https://example.com" },
      result: "success",
      duration_ms: 3
    });
    const entries = log.query("s1", {});
    expect(entries).toHaveLength(2);
    expect(entries[0]?.action).toBe("type");
    expect(entries[1]?.action).toBe("navigate");
  });
});

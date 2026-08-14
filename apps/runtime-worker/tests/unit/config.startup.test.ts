import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_KEY = "0123456789abcdef0123456789abcdef";

describe("config startup validation", () => {
  afterEach(() => {
    process.env.VINDICATE_INTERNAL_KEY = TEST_KEY;
    vi.resetModules();
  });

  it("fails at import when VINDICATE_INTERNAL_KEY is missing", async () => {
    delete process.env.VINDICATE_INTERNAL_KEY;
    vi.resetModules();

    await expect(import("../../src/core/config.js")).rejects.toThrow();
  });

  it("fails at import when VINDICATE_INTERNAL_KEY is too short", async () => {
    process.env.VINDICATE_INTERNAL_KEY = "too-short";
    vi.resetModules();

    await expect(import("../../src/core/config.js")).rejects.toThrow();
  });
});

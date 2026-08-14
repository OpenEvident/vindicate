import { afterEach, describe, expect, it, vi } from "vitest";

import { VindicateVisualDiagnosisSchema } from "../../src/core/config.js";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("loads with required env from vitest.config", async () => {
    const { config } = await import("../../src/core/config.js");
    expect(config.VINDICATE_INTERNAL_KEY.length).toBeGreaterThanOrEqual(32);
    expect(config.VINDICATE_PROJECT_ROOT.length).toBeGreaterThan(0);
    expect(config.VINDICATE_VISUAL_DIAGNOSIS).toBe(true);
  });
});

describe("VINDICATE_VISUAL_DIAGNOSIS env parsing", () => {
  it('parses env string "false" as false', () => {
    expect(VindicateVisualDiagnosisSchema.parse("false")).toBe(false);
  });

  it('parses env string "true" as true', () => {
    expect(VindicateVisualDiagnosisSchema.parse("true")).toBe(true);
  });

  it("defaults to true when unset", () => {
    expect(VindicateVisualDiagnosisSchema.parse(undefined)).toBe(true);
  });

  it('loads false from process.env when set to "false"', async () => {
    vi.stubEnv("VINDICATE_VISUAL_DIAGNOSIS", "false");
    vi.resetModules();
    const { config } = await import("../../src/core/config.js");
    expect(config.VINDICATE_VISUAL_DIAGNOSIS).toBe(false);
  });
});

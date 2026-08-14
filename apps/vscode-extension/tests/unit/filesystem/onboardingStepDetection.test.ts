import { describe, expect, it } from "vitest";

import { detectPresentOnboardingSteps } from "../../../src/extension/filesystem/onboardingStepDetection.js";

describe("detectPresentOnboardingSteps", () => {
  const emptySpecs = { total: 0, complete: 0, partial: 0, missing: 0, features: [] };

  it("credits step 4 when test files exist without feature traceability", async () => {
    const steps = await detectPresentOnboardingSteps("/project", emptySpecs, true);
    expect(steps.has(4)).toBe(true);
    expect(steps.has(3)).toBe(false);
  });

  it("does not credit step 4 when no test files are present", async () => {
    const steps = await detectPresentOnboardingSteps("/project", emptySpecs, false);
    expect(steps.has(4)).toBe(false);
  });

  it("credits steps 1–3 when stories exist", async () => {
    const steps = await detectPresentOnboardingSteps(
      "/project",
      { total: 1, complete: 1, partial: 0, missing: 0, features: [] },
      false
    );
    expect(steps.has(1)).toBe(true);
    expect(steps.has(2)).toBe(true);
    expect(steps.has(3)).toBe(true);
  });
});

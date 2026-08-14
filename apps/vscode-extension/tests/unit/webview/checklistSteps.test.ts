import { describe, expect, it } from "vitest";
import { deriveChecklistSteps } from "../../../src/webview/lib/checklistSteps";
import { EMPTY_SELECTED_TOOLS } from "../../../src/shared/types";
import type { StepId } from "../../../src/shared/types";

const baseParams = {
  completedSteps: [] as StepId[],
  mode: null,
  confirmedTools: null,
  detectedTools: EMPTY_SELECTED_TOOLS,
  hasFolder: true,
  onboardingDone: false,
  extensionVersion: "1.0.0"
};

describe("deriveChecklistSteps", () => {
  it("activates the connect-agents step as soon as a folder is open", () => {
    const steps = deriveChecklistSteps({
      ...baseParams,
      screen: "toolSelection"
    });
    expect(steps[1]?.status).toBe("active");
  });

  it("locks the mode-selection step until tools are confirmed", () => {
    const steps = deriveChecklistSteps({
      ...baseParams,
      screen: "toolSelection"
    });
    expect(steps[2]?.status).toBe("locked");
  });

  it("marks connect-agents done and activates mode selection once on that screen", () => {
    const steps = deriveChecklistSteps({
      ...baseParams,
      screen: "modeSelection"
    });
    expect(steps[1]?.status).toBe("done");
    expect(steps[2]?.status).toBe("active");
  });

  it("returns exactly 4 steps", () => {
    const steps = deriveChecklistSteps({
      ...baseParams,
      screen: "toolSelection"
    });
    expect(steps).toHaveLength(4);
  });
});

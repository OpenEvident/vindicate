import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOnboardingStepComplete,
  applyOnboardingStepRevoke
} from "../../../src/extension/onboarding/applyOnboardingStepChange";
import type { VindicateWorkspaceState } from "../../../src/shared/types";

describe("applyOnboardingStepChange", () => {
  const broadcaster = { broadcast: vi.fn() };
  const statusBar = { setState: vi.fn() };
  const stateFile = { write: vi.fn().mockResolvedValue(undefined) };

  let state: VindicateWorkspaceState;

  const workspaceState = {
    getState: () => state,
    setMode: vi.fn(),
    setToolsConfirmed: vi.fn(),
    markStepDone: vi.fn(async (step: 1 | 2 | 3 | 4) => {
      if (!state.completedSteps.includes(step)) {
        state = { ...state, completedSteps: [...state.completedSteps, step] };
      }
    }),
    unmarkStep: vi.fn(async (step: 1 | 2 | 3 | 4) => {
      state = {
        ...state,
        completedSteps: state.completedSteps.filter((s) => s !== step)
      };
    }),
    setOnboardingDone: vi.fn(async () => {
      state = { ...state, onboardingDone: true };
    }),
    clearOnboardingDone: vi.fn(async () => {
      state = { ...state, onboardingDone: false };
    }),
    reset: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      selectedMode: "build",
      completedSteps: [1, 2, 3, 4],
      onboardingDone: true,
      toolsConfirmed: true
    };
  });

  it("revoke unmarks step and syncs onboarding state", async () => {
    await applyOnboardingStepRevoke(1, {
      workspaceState,
      stateFile,
      broadcaster,
      statusBar,
      getFolderPath: () => "/project"
    });

    expect(state.completedSteps).toEqual([2, 3, 4]);
    expect(state.onboardingDone).toBe(true);
    expect(stateFile.write).toHaveBeenCalled();
    expect(broadcaster.broadcast).toHaveBeenCalledWith({
      type: "onboarding:stepRevoked",
      step: 1
    });
    expect(broadcaster.broadcast).toHaveBeenCalledWith({
      type: "onboarding:stateSync",
      state: expect.objectContaining({ completedSteps: [2, 3, 4] })
    });
  });

  it("complete marks onboarding done when all four steps present", async () => {
    state = {
      selectedMode: "build",
      completedSteps: [1, 2, 3],
      onboardingDone: false,
      toolsConfirmed: true
    };

    await applyOnboardingStepComplete(4, {
      workspaceState,
      stateFile,
      broadcaster,
      statusBar,
      getFolderPath: () => "/project"
    });

    expect(state.completedSteps).toEqual([1, 2, 3, 4]);
    expect(state.onboardingDone).toBe(true);
    expect(statusBar.setState).toHaveBeenCalledWith("active");
  });
});

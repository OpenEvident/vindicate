import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { WorkspaceStateService } from "../../src/extension/shared/WorkspaceStateService";
import { WORKSPACE_STATE_KEYS } from "../../src/extension/shared/constants";

function createMockContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  const workspaceState = {
    get: <T>(key: string, defaultValue: T): T =>
      (store.has(key) ? store.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    },
    keys: () => [...store.keys()]
  };
  return { workspaceState } as vscode.ExtensionContext;
}

describe("WorkspaceStateService", () => {
  let ctx: vscode.ExtensionContext;
  let service: WorkspaceStateService;

  beforeEach(() => {
    ctx = createMockContext();
    service = new WorkspaceStateService(ctx);
  });

  it("getState() returns defaults when nothing stored", () => {
    expect(service.getState()).toEqual({
      selectedMode: null,
      completedSteps: [],
      onboardingDone: false,
      toolsConfirmed: false
    });
  });

  it("setMode() persists mode, getState() returns it", async () => {
    await service.setMode("build");
    expect(service.getState().selectedMode).toBe("build");
  });

  it("markStepDone() appends without duplicates", async () => {
    await service.markStepDone(1);
    await service.markStepDone(2);
    await service.markStepDone(1);
    expect(service.getState().completedSteps).toEqual([1, 2]);
  });

  it("markStepDone() is idempotent for the same step", async () => {
    await service.markStepDone(3);
    await service.markStepDone(3);
    expect(service.getState().completedSteps).toEqual([3]);
  });

  it("unmarkStep() removes a completed step", async () => {
    await service.markStepDone(1);
    await service.markStepDone(2);
    await service.unmarkStep(1);
    expect(service.getState().completedSteps).toEqual([2]);
  });

  it("clearOnboardingDone() resets onboarding flag", async () => {
    await service.setOnboardingDone();
    await service.clearOnboardingDone();
    expect(service.getState().onboardingDone).toBe(false);
  });

  it("reset() clears all fields", async () => {
    await service.setMode("build");
    await service.markStepDone(1);
    await service.setOnboardingDone();
    await service.reset();
    expect(service.getState()).toEqual({
      selectedMode: null,
      completedSteps: [],
      onboardingDone: false,
      toolsConfirmed: false
    });
    expect(ctx.workspaceState.get(WORKSPACE_STATE_KEYS.selectedMode, null)).toBeNull();
  });
});

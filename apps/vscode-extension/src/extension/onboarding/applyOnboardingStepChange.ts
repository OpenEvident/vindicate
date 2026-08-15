import type { StepId } from "../../shared/types";
import type { IStateFileService } from "../shared/StateFileService";
import type { IWorkspaceStateService } from "../shared/WorkspaceStateService";
import type { IBroadcaster } from "../views/Broadcaster";
import type { VindicateStatusBarItem } from "../views/StatusBarItem";

export interface OnboardingStepChangeDeps {
  workspaceState: IWorkspaceStateService;
  stateFile: IStateFileService;
  broadcaster: IBroadcaster;
  statusBar: VindicateStatusBarItem;
  getFolderPath: () => string | null;
  trackStep?: (step: StepId, event: "completed" | "revoked") => void;
}

export async function applyOnboardingStepComplete(
  step: StepId,
  deps: OnboardingStepChangeDeps
): Promise<void> {
  await deps.workspaceState.markStepDone(step);
  const state = deps.workspaceState.getState();
  if (state.completedSteps.length >= 4 && !state.onboardingDone) {
    await deps.workspaceState.setOnboardingDone();
    deps.statusBar.setState("active");
    await persistOnboarding(deps);
    deps.broadcaster.broadcast({ type: "onboarding:stepDone", step });
    deps.broadcaster.broadcast({
      type: "onboarding:stateSync",
      state: deps.workspaceState.getState()
    });
    deps.broadcaster.broadcast({ type: "navigate:screen", screen: "dashboard" });
    deps.trackStep?.(step, "completed");
    return;
  }
  await persistOnboarding(deps);
  deps.broadcaster.broadcast({ type: "onboarding:stepDone", step });
  deps.trackStep?.(step, "completed");
}

export async function applyOnboardingStepRevoke(
  step: StepId,
  deps: OnboardingStepChangeDeps
): Promise<void> {
  await deps.workspaceState.unmarkStep(step);
  await persistOnboarding(deps);
  deps.broadcaster.broadcast({ type: "onboarding:stepRevoked", step });
  deps.broadcaster.broadcast({
    type: "onboarding:stateSync",
    state: deps.workspaceState.getState()
  });
  deps.trackStep?.(step, "revoked");
}

async function persistOnboarding(deps: OnboardingStepChangeDeps): Promise<void> {
  const folderPath = deps.getFolderPath();
  if (!folderPath) return;
  await deps.stateFile.write(folderPath, deps.workspaceState.getState());
}

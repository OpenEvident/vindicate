import { useEffect } from "react";
import { onExtensionMessage, postToExtension } from "../lib/bridge";
import { useConfigStore } from "../stores/configStore";
import { useDashboardStore } from "../stores/dashboardStore";
import { useHealthStore } from "../stores/healthStore";
import { useOnboardingStore } from "../stores/onboardingStore";
import { usePromptsStore } from "../stores/promptsStore";
import { useUiStore } from "../stores/uiStore";
import { stepRevokedMessage } from "../../shared/onboardingLabels";
import type { StepId } from "../lib/types";

const STEP_TOAST: Record<StepId, string> = {
  1: "Step 1 complete — domain.md detected",
  2: "Step 2 complete — context.md detected",
  3: "Step 3 complete — feature spec detected",
  4: "Step 4 complete — test suite detected"
};

export function useExtensionMessages(): void {
  const onboardingStore = useOnboardingStore();
  const dashboardStore = useDashboardStore();
  const healthStore = useHealthStore();
  const configStore = useConfigStore();
  const promptsStore = usePromptsStore();
  const setToast = useUiStore((s) => s.setToast);
  const setLastAnimatedStep = useUiStore((s) => s.setLastAnimatedStep);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((msg) => {
      switch (msg.type) {
        case "workspace:resolved":
          onboardingStore.setFolder(msg.hasFolder, msg.folderName, msg.folderPath);
          break;
        case "onboarding:stateSync":
          onboardingStore.syncState(msg.state);
          break;
        case "onboarding:stepDone": {
          const alreadyDone = onboardingStore.completedSteps.includes(msg.step);
          onboardingStore.markStepDone(msg.step);
          if (!alreadyDone) {
            setLastAnimatedStep(msg.step);
            setToast(STEP_TOAST[msg.step]);
          }
          break;
        }
        case "onboarding:stepRevoked":
          onboardingStore.revokeStep(msg.step);
          setLastAnimatedStep(null);
          setToast(stepRevokedMessage(msg.step));
          break;
        case "onboarding:toolsDetected":
          onboardingStore.setDetectedTools(msg.tools);
          break;
        case "dashboard:loading":
          dashboardStore.setLoading(true);
          break;
        case "dashboard:metrics":
          dashboardStore.setMetrics(msg.metrics);
          break;
        case "dashboard:error":
          dashboardStore.setError(msg.message);
          break;
        case "health:status":
          healthStore.setStatus(msg.runtime, msg.mcp);
          break;
        case "config:status":
          configStore.setStatuses(msg.statuses);
          break;
        case "config:operationResult":
          configStore.setPending(msg.tool, false);
          if (msg.message) {
            setToast(msg.message);
          }
          break;
        case "navigate:screen":
          onboardingStore.setScreen(msg.screen);
          break;
        case "workspace:recentFolders":
          onboardingStore.setRecentFolders(msg.folders);
          break;
        case "prompts:templates":
          promptsStore.setTemplates(msg.templates);
          break;
        case "recording_started":
        case "recording_show_dashboard":
        case "recording_steps_batch":
        case "recording_stopped":
        case "recording_finalized":
        case "recording_finalize_failed":
        case "recording_discarded":
        case "recording_discard_failed":
        case "recording_restored":
        case "recording_load_failed":
        case "recordings_list":
        case "playback_started":
        case "playback_progress":
        case "playback_failed":
        case "playback_complete":
        case "worker_status":
        case "annotate_succeeded":
        case "annotate_failed":
          break;
        default: {
          const _exhaustive: never = msg;
          return void _exhaustive;
        }
      }
    });
    postToExtension({ type: "ready" });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
  }, []);
}

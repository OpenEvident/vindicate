import path from "node:path";
import type { IConfigStatusService } from "../config/ConfigStatusService";
import type { ServiceHealth } from "../../shared/types";
import type { IWorkspaceStateService } from "../shared/WorkspaceStateService";
import type { DashboardMetricsCache } from "./DashboardMetricsCache";
import type { IBroadcaster } from "./Broadcaster";
import { deriveScreen } from "./screenRouter";

export async function syncWebviewState(deps: {
  workspaceState: IWorkspaceStateService;
  configStatus: IConfigStatusService;
  broadcaster: IBroadcaster;
  metricsCache: DashboardMetricsCache;
  folderPath: string | null;
  getHealth?: () => ServiceHealth;
}): Promise<void> {
  const { workspaceState, configStatus, broadcaster, metricsCache, folderPath, getHealth } = deps;

  if (getHealth) {
    const health = getHealth();
    broadcaster.broadcast({ type: "health:status", ...health });
  }
  broadcaster.broadcast({
    type: "workspace:resolved",
    hasFolder: folderPath !== null,
    folderName: folderPath ? path.basename(folderPath) : null,
    folderPath
  });
  broadcaster.broadcast({ type: "onboarding:stateSync", state: workspaceState.getState() });
  broadcaster.broadcast({ type: "prompts:templates", templates: workspaceState.getPromptTemplates() });

  const statuses = await configStatus.getStatuses(folderPath);
  broadcaster.broadcast({ type: "config:status", statuses });
  const tools = await configStatus.getDefaultToolSelection();
  broadcaster.broadcast({ type: "onboarding:toolsDetected", tools });

  if (!folderPath) {
    metricsCache.clear();
  } else {
    const cached = metricsCache.get();
    if (cached) {
      broadcaster.broadcast({ type: "dashboard:metrics", metrics: cached });
    }
  }

  const state = workspaceState.getState();
  const screen = deriveScreen({
    folderPath,
    toolsConfirmed: state.toolsConfirmed,
    selectedMode: state.selectedMode,
    onboardingDone: state.onboardingDone
  });
  broadcaster.broadcast({ type: "navigate:screen", screen });
}

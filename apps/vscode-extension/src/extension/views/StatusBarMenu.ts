import * as vscode from "vscode";
import { COMMANDS, VIEW_IDS } from "../shared/constants";
import type { ServiceHealth } from "../shared/types";
import type { IWorkspaceStateService } from "../shared/WorkspaceStateService";
import type { IFileWatcherService } from "../filesystem/FileWatcherService";
import type { VindicateLogger } from "../shared/logger";

export interface StatusBarMenuDeps {
  workspaceState: IWorkspaceStateService;
  getFolderPath: () => string | null;
  getHealth: () => ServiceHealth;
  recheckHealth: () => void;
  fileWatcher: IFileWatcherService;
  logger: VindicateLogger;
}

interface MenuEntry {
  label: string;
  description?: string;
  command: string;
  args?: unknown[];
}

function healthSummary(health: ServiceHealth): string {
  const dot = (s: ServiceHealth["runtime"]) => (s === "up" ? "●" : s === "down" ? "○" : "◌");
  return `Runtime ${dot(health.runtime)}  MCP ${dot(health.mcp)}`;
}

function onboardingSummary(state: ReturnType<IWorkspaceStateService["getState"]>): string {
  const mode = state.selectedMode ? state.selectedMode.toUpperCase() : "—";
  const steps = state.completedSteps.length;
  return `Mode ${mode} · ${steps}/4 steps`;
}

export async function showStatusBarMenu(deps: StatusBarMenuDeps): Promise<void> {
  const folderPath = deps.getFolderPath();
  const state = deps.workspaceState.getState();
  const health = deps.getHealth();

  const items: MenuEntry[] = [];

  if (!folderPath) {
    items.push({
      label: "$(folder-opened) Open folder",
      description: "Select a workspace for Vindicate",
      command: "vscode.openFolder"
    });
    items.push({
      label: "$(home) Open Home",
      command: COMMANDS.openHome
    });
  } else {
    items.push({
      label: "$(home) Open Home",
      description: state.onboardingDone ? "Dashboard and project health" : "Continue onboarding",
      command: COMMANDS.openHome
    });
    items.push({
      label: "$(list-unordered) Prompts & Config",
      description: "Bottom panel — copy prompts, MCP setup",
      command: COMMANDS.showPanel
    });
    items.push({
      label: "$(record) Open Recordings",
      description: "Browser session recordings — record, review, finalize",
      command: COMMANDS.openRecordings
    });
    items.push({
      label: "$(layout-sidebar-left) Open sidebar",
      description: "Compact summary view",
      command: `${VIEW_IDS.sidebar}.focus`
    });
    items.push({
      label: "$(sync) Recheck status",
      description: "Re-ping runtime and MCP now",
      command: "vindicate.internal.recheckHealth"
    });
    items.push({
      label: "$(refresh) Refresh metrics",
      description: "Rescan specs, tests, and Playwright results",
      command: "vindicate.internal.refreshMetrics"
    });
    items.push({
      label: "$(output) Open logs",
      description: "Vindicate output channel",
      command: "vindicate.internal.openLogs"
    });
  }

  const header = folderPath ? `${onboardingSummary(state)} · ${healthSummary(health)}` : "No workspace folder";

  type QuickPickEntry = vscode.QuickPickItem & { entry: MenuEntry };

  const pick = await vscode.window.showQuickPick<QuickPickEntry>(
    items.map((item) => {
      const row: QuickPickEntry = { label: item.label, entry: item };
      if (item.description) row.description = item.description;
      return row;
    }),
    {
      title: "Vindicate",
      placeHolder: header,
      matchOnDescription: true
    }
  );

  if (!pick) return;

  const selected = pick.entry;

  if (selected.command === "vindicate.internal.recheckHealth") {
    deps.recheckHealth();
    return;
  }
  if (selected.command === "vindicate.internal.refreshMetrics") {
    await deps.fileWatcher.refresh();
    return;
  }
  if (selected.command === "vindicate.internal.openLogs") {
    deps.logger.show();
    return;
  }

  if (selected.args?.length) {
    await vscode.commands.executeCommand(selected.command, ...selected.args);
  } else {
    await vscode.commands.executeCommand(selected.command);
  }
}

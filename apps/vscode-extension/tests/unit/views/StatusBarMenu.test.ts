import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { showStatusBarMenu } from "../../../src/extension/views/StatusBarMenu";
import type { IFileWatcherService } from "../../../src/extension/filesystem/FileWatcherService";
import type { IWorkspaceStateService } from "../../../src/extension/shared/WorkspaceStateService";

describe("showStatusBarMenu", () => {
  const workspaceState: IWorkspaceStateService = {
    getPromptTemplates: vi.fn().mockReturnValue([]),
    setPromptTemplates: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({
      selectedMode: "build",
      completedSteps: [1, 2],
      onboardingDone: false,
      toolsConfirmed: true
    }),
    setMode: vi.fn(),
    setToolsConfirmed: vi.fn(),
    markStepDone: vi.fn(),
    unmarkStep: vi.fn(),
    clearOnboardingDone: vi.fn(),
    setOnboardingDone: vi.fn(),
    reset: vi.fn()
  };

  const fileWatcher: IFileWatcherService = {
    getLastPresentSteps: vi.fn().mockReturnValue(new Set()),
    refresh: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    onWillRefresh: vi.fn(),
    onDidStepComplete: vi.fn(),
    onDidStepRevoke: vi.fn(),
    onDidMetricsChange: vi.fn(),
    onDidWatchError: vi.fn()
  };

  const logger = {
    show: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    dispose: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs openHome when user picks Open Home", async () => {
    const execute = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
      label: "$(home) Open Home",
      entry: {
        label: "$(home) Open Home",
        command: "vindicate.openHome"
      }
    } as never);

    await showStatusBarMenu({
      workspaceState,
      getFolderPath: () => "/project",
      getHealth: () => ({ runtime: "up", mcp: "down" }),
      fileWatcher,
      logger
    });

    expect(execute).toHaveBeenCalledWith("vindicate.openHome");
    execute.mockRestore();
  });

  it("offers Open folder when no workspace folder is open", async () => {
    const labels: string[] = [];
    vi.spyOn(vscode.window, "showQuickPick").mockImplementation(async (items) => {
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && typeof item === "object" && "label" in item) {
            labels.push(String(item.label));
          }
        }
      }
      return undefined;
    });

    await showStatusBarMenu({
      workspaceState,
      getFolderPath: () => null,
      getHealth: () => ({ runtime: "unknown", mcp: "unknown" }),
      fileWatcher,
      logger
    });

    expect(labels.some((l) => l.includes("Open folder"))).toBe(true);
  });
});

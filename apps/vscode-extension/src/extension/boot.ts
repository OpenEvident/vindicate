import path from "node:path";
import * as vscode from "vscode";
import type { MessageRouter } from "./views/MessageRouter";
import type { IFileWatcherService } from "./filesystem/FileWatcherService";
import type { IWorkspaceResolver } from "./filesystem/WorkspaceResolver";
import { HealthPingService } from "./health/HealthPingService";
import type { IStateFileService } from "./shared/StateFileService";
import type { ILogger } from "./shared/logger";
import type { IWorkspaceStateService } from "./shared/WorkspaceStateService";
import type { IBroadcaster } from "./views/Broadcaster";
import type { VindicateStatusBarItem } from "./views/StatusBarItem";
import type { RuntimeLifecycle } from "./processes/RuntimeLifecycle";

export interface BootOptions {
  wsResolver: IWorkspaceResolver;
  workspaceState: IWorkspaceStateService;
  stateFile: IStateFileService;
  fileWatcher: IFileWatcherService;
  healthPing: HealthPingService;
  runtimeLifecycle: RuntimeLifecycle;
  broadcaster: IBroadcaster;
  statusBar: VindicateStatusBarItem;
  router: MessageRouter;
  logger: ILogger;
  isSurfaceVisible: () => boolean;
  onFolderPathChange?: (folderPath: string | null) => void;
}

export async function boot(opts: BootOptions): Promise<string | null> {
  const {
    wsResolver,
    workspaceState,
    stateFile,
    fileWatcher,
    healthPing,
    runtimeLifecycle,
    broadcaster,
    statusBar,
    router,
    isSurfaceVisible,
    onFolderPathChange
  } = opts;

  const resolution = await wsResolver.resolve();
  const folderPath = resolution.kind !== "none" ? resolution.folder.uri.fsPath : null;
  onFolderPathChange?.(folderPath);

  broadcaster.broadcast({
    type: "workspace:resolved",
    hasFolder: folderPath !== null,
    folderName: folderPath ? path.basename(folderPath) : null,
    folderPath
  });

  if (folderPath) {
    const fileState = await stateFile.read(folderPath);
    const cached = workspaceState.getState();
    if (!cached.selectedMode && fileState.selectedMode) {
      await workspaceState.setMode(fileState.selectedMode);
    }
    if (cached.completedSteps.length === 0 && fileState.completedSteps?.length) {
      for (const step of fileState.completedSteps) {
        await workspaceState.markStepDone(step);
      }
    }
    if (!cached.onboardingDone && fileState.onboardingDone) {
      await workspaceState.setOnboardingDone();
    }
  }

  if (!folderPath) statusBar.setState("noFolder");
  else if (!workspaceState.getState().onboardingDone) statusBar.setState("setup");
  else statusBar.setState("active");

  const shouldRunBackground = isSurfaceVisible();
  if (folderPath && shouldRunBackground) {
    fileWatcher.start(folderPath);
    await fileWatcher.refresh();
    await reconcilePersistedOnboardingSteps({
      fileWatcher,
      workspaceState,
      stateFile,
      folderPath
    });
  }

  if (shouldRunBackground) {
    healthPing.start();
  } else {
    fileWatcher.stop();
    healthPing.stop();
  }

  await runtimeLifecycle.start(folderPath);

  wsResolver.onDidChange(async (newResolution) => {
    const newPath = newResolution.kind !== "none" ? newResolution.folder.uri.fsPath : null;
    onFolderPathChange?.(newPath);
    broadcaster.broadcast({
      type: "workspace:resolved",
      hasFolder: newPath !== null,
      folderName: newPath ? path.basename(newPath) : null,
      folderPath: newPath
    });
    const shouldRunNow = isSurfaceVisible();
    if (newPath && shouldRunNow) {
      const folderCount = vscode.workspace.workspaceFolders?.length ?? 1;
      if (folderCount > 1) {
        opts.logger.warn(
          `Multi-root workspace detected (${folderCount} folders). Vindicate uses the first folder: ${newPath}`
        );
      }
      fileWatcher.stop();
      fileWatcher.start(newPath);
      await fileWatcher.refresh();
      await reconcilePersistedOnboardingSteps({
        fileWatcher,
        workspaceState,
        stateFile,
        folderPath: newPath
      });
    } else {
      fileWatcher.stop();
    }
    await runtimeLifecycle.restartForFolder(newPath);
    if (shouldRunNow) {
      healthPing.start();
    } else {
      healthPing.stop();
    }
  });

  await router.syncWebviewState(folderPath);

  return folderPath;
}

async function reconcilePersistedOnboardingSteps(opts: {
  fileWatcher: IFileWatcherService;
  workspaceState: IWorkspaceStateService;
  stateFile: IStateFileService;
  folderPath: string;
}): Promise<void> {
  const present = opts.fileWatcher.getLastPresentSteps();

  // Do NOT revoke persisted steps that lack a file — the user may have
  // completed them via "Mark done manually" or "Skip". Live deletions are
  // handled by the running file-watcher events instead.
  let state = opts.workspaceState.getState();

  for (const step of present) {
    if (!state.completedSteps.includes(step)) {
      await opts.workspaceState.markStepDone(step);
    }
  }

  state = opts.workspaceState.getState();
  if (state.completedSteps.length >= 4 && !state.onboardingDone) {
    await opts.workspaceState.setOnboardingDone();
  }

  await opts.stateFile.write(opts.folderPath, opts.workspaceState.getState());
}

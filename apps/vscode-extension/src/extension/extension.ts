import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { AgentSkillWriter } from "./config/AgentSkillWriter";
import { AntigravityAgentsMdWriter } from "./config/AntigravityAgentsMdWriter";
import { ClaudeMdWriter } from "./config/ClaudeMdWriter";
import { CopilotInstructionsWriter } from "./config/CopilotInstructionsWriter";
import { CursorRuleWriter } from "./config/CursorRuleWriter";
import { McpConfigWriter } from "./config/McpConfigWriter";
import { ConfigStatusService } from "./config/ConfigStatusService";
import { ToolDetector } from "./config/ToolDetector";
import { FileWatcherService } from "./filesystem/FileWatcherService";
import { MetricsCalculator } from "./filesystem/MetricsCalculator";
import { PlaywrightOutputReader } from "./filesystem/PlaywrightOutputReader";
import { SpecAnalyzer } from "./filesystem/SpecAnalyzer";
import { TraceabilityMatcher } from "./filesystem/TraceabilityMatcher";
import { WorkspaceResolver } from "./filesystem/WorkspaceResolver";
import { HealthPingService } from "./health/HealthPingService";
import { boot } from "./boot";
import { COMMANDS, STATE_KEYS, VIEW_IDS } from "./shared/constants";
import type { WebviewMessage } from "./shared/messages";
import type { StepId } from "./shared/types";
import { VindicateLogger } from "./shared/logger";
import { createSessionLogFile } from "./shared/sessionLogFile";
import { StateFileService } from "./shared/StateFileService";
import { WorkspaceStateService } from "./shared/WorkspaceStateService";
import { TelemetryService } from "./telemetry/TelemetryService";
import { BottomPanelProvider } from "./views/BottomPanelProvider";
import { Broadcaster } from "./views/Broadcaster";
import { EditorTabPanel } from "./views/EditorTabPanel";
import { MessageRouter } from "./views/MessageRouter";
import { VindicateStatusBarItem } from "./views/StatusBarItem";
import { showStatusBarMenu } from "./views/StatusBarMenu";
import { DashboardMetricsCache } from "./views/DashboardMetricsCache";
import { DashboardDeltaTracker } from "./views/DashboardDeltaTracker";
import { SidebarViewProvider } from "./views/SidebarViewProvider";
import { SurfaceVisibilityTracker } from "./views/SurfaceVisibilityTracker";
import {
  applyOnboardingStepComplete,
  applyOnboardingStepRevoke
} from "./onboarding/applyOnboardingStepChange";
import { McpManager } from "./processes/McpManager";
import { RuntimeLifecycle } from "./processes/RuntimeLifecycle";
import { WorkerManager } from "./processes/WorkerManager";
import { RecordingController } from "./recording/recording-controller";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const debugLogging = vscode.workspace.getConfiguration("vindicate").get<boolean>("debugLogging", false);
  const sessionLogFile = debugLogging ? createSessionLogFile() : undefined;
  const logger = new VindicateLogger(sessionLogFile);
  const telemetry = new TelemetryService(logger);
  const statusBar = new VindicateStatusBarItem();

  const workspaceState = new WorkspaceStateService(context);
  const stateFile = new StateFileService(logger);

  const specAnalyzer = new SpecAnalyzer();
  const traceMatcher = new TraceabilityMatcher();
  const playwrightReader = new PlaywrightOutputReader(logger);
  const metricsCalc = new MetricsCalculator();
  const fileWatcher = new FileWatcherService(
    specAnalyzer,
    traceMatcher,
    playwrightReader,
    metricsCalc,
    logger
  );
  const wsResolver = new WorkspaceResolver(context, logger);

  const toolDetector = new ToolDetector();
  const mcpWriter = new McpConfigWriter(logger);
  const ruleWriter = new CursorRuleWriter(logger);
  const claudeMdWriter = new ClaudeMdWriter(logger);
  const copilotWriter = new CopilotInstructionsWriter(logger);
  const skillWriter = new AgentSkillWriter(logger, context.extensionPath);
  const antigravityAgentsMdWriter = new AntigravityAgentsMdWriter(logger);
  const configStatus = new ConfigStatusService(
    toolDetector,
    mcpWriter,
    ruleWriter,
    claudeMdWriter,
    copilotWriter,
    skillWriter,
    antigravityAgentsMdWriter
  );
  const metricsCache = new DashboardMetricsCache();
  const deltaTracker = new DashboardDeltaTracker(context);

  let currentFolder: string | null = null;
  const routerHolder: { router: MessageRouter | null } = { router: null };
  let shouldSyncOnReady = false;
  const surfaceVisibility = new SurfaceVisibilityTracker();
  let backgroundSyncInFlight = false;
  let backgroundSyncQueued = false;

  const syncBackgroundWork = async (): Promise<void> => {
    backgroundSyncQueued = true;
    if (backgroundSyncInFlight) return;
    backgroundSyncInFlight = true;
    try {
      while (backgroundSyncQueued) {
        backgroundSyncQueued = false;
        const shouldRunBackground = surfaceVisibility.isAnyVisible();
        if (!shouldRunBackground) {
          fileWatcher.stop();
          healthPing.stop();
          continue;
        }

        healthPing.start();
        if (currentFolder) {
          fileWatcher.start(currentFolder);
          await fileWatcher.refresh();
        } else {
          fileWatcher.stop();
        }
      }
    } finally {
      backgroundSyncInFlight = false;
      if (backgroundSyncQueued) {
        void syncBackgroundWork();
      } else {
        backgroundSyncQueued = false;
      }
    }
  };

  const setSurfaceVisible = (surface: "sidebar" | "panel" | "editor", visible: boolean): void => {
    surfaceVisibility.setSurfaceVisibility(surface, visible);
    void syncBackgroundWork();
  };

  const handleMessage = async (msg: WebviewMessage): Promise<void> => {
    if (!routerHolder.router) {
      if (msg.type === "ready") shouldSyncOnReady = true;
      return;
    }
    await routerHolder.router.handle(msg, currentFolder);
  };

  const sidebar = new SidebarViewProvider(context.extensionUri, handleMessage, (visible) =>
    setSurfaceVisible("sidebar", visible)
  );
  const bottomPanel = new BottomPanelProvider(context.extensionUri, handleMessage, (visible) =>
    setSurfaceVisible("panel", visible)
  );
  const broadcaster = new Broadcaster(sidebar, bottomPanel, () => EditorTabPanel.getCurrent());
  const healthPing = new HealthPingService(broadcaster, logger);

  const workerManager = new WorkerManager(logger, context.extensionPath);
  const mcpManager = new McpManager(logger, context.extensionPath);
  const recordingController = new RecordingController(context, workerManager, context.extensionUri);
  const runtimeLifecycle = new RuntimeLifecycle({
    workerManager,
    mcpManager,
    logger,
    statusBar,
    getFolderPath: () => currentFolder,
    logFile: sessionLogFile
  });

  routerHolder.router = new MessageRouter(
    workspaceState,
    stateFile,
    runtimeLifecycle,
    mcpWriter,
    ruleWriter,
    claudeMdWriter,
    copilotWriter,
    skillWriter,
    antigravityAgentsMdWriter,
    fileWatcher,
    broadcaster,
    logger,
    telemetry,
    toolDetector,
    configStatus,
    metricsCache,
    statusBar,
    () => healthPing.getHealth()
  );

  if (shouldSyncOnReady) {
    await routerHolder.router.handle({ type: "ready" }, null);
  }

  healthPing.onDidHealthChange((health) => {
    statusBar.setServiceHealth(health);
  });

  workerManager.onDidStateChange((state) => {
    if (state === "error") {
      statusBar.setState("error");
    }
  });
  mcpManager.onDidStateChange((state) => {
    if (state === "error") {
      statusBar.setState("error");
    }
  });

  // staleToastShown is scoped to the activate() lifetime — resets on extension host restart
  let staleToastShown = false;

  const onboardingStepDeps = {
    workspaceState,
    stateFile,
    broadcaster,
    statusBar,
    getFolderPath: () => currentFolder,
    trackStep: (step: StepId, event: "completed" | "revoked") => {
      telemetry.track(event === "completed" ? "step_completed" : "step_revoked", {
        step: String(step)
      });
    }
  };

  fileWatcher.onDidStepComplete((step) => {
    void applyOnboardingStepComplete(step, onboardingStepDeps);
  });

  fileWatcher.onDidStepRevoke((step) => {
    void applyOnboardingStepRevoke(step, onboardingStepDeps);
  });

  fileWatcher.onWillRefresh(() => {
    broadcaster.broadcast({ type: "dashboard:loading" });
  });

  fileWatcher.onDidMetricsChange((metrics) => {
    const withDeltas = deltaTracker.apply(metrics);
    metricsCache.set(withDeltas);
    broadcaster.broadcast({ type: "dashboard:metrics", metrics: withDeltas });
    if (
      !staleToastShown &&
      withDeltas.testFreshnessDays !== null &&
      withDeltas.testFreshnessDays > 3
    ) {
      staleToastShown = true;
      void vscode.window.showWarningMessage(
        `Test results are ${withDeltas.testFreshnessDays} days old — run Playwright to refresh`
      );
    }
  });

  fileWatcher.onDidWatchError((err) => {
    broadcaster.broadcast({ type: "dashboard:error", message: err.message });
  });

  context.subscriptions.push(
    logger,
    statusBar,
    fileWatcher,
    healthPing,
    runtimeLifecycle,
    workerManager,
    mcpManager,
    recordingController.activate(),
    wsResolver,
    vscode.window.registerWebviewViewProvider(VIEW_IDS.sidebar, sidebar),
    vscode.window.registerWebviewViewProvider(VIEW_IDS.panel, bottomPanel),
    vscode.commands.registerCommand(COMMANDS.openHome, () => {
      EditorTabPanel.createOrShow(context.extensionUri, handleMessage, (visible) =>
        setSurfaceVisible("editor", visible)
      );
      healthPing.pushCurrentHealth();
    }),
    vscode.commands.registerCommand(COMMANDS.showPanel, async () => {
      await vscode.commands.executeCommand("workbench.view.extension.vindicate-panel-container");
      await vscode.commands.executeCommand(`${VIEW_IDS.panel}.focus`);
    }),
    vscode.commands.registerCommand(COMMANDS.statusBarMenu, () =>
      showStatusBarMenu({
        workspaceState,
        getFolderPath: () => currentFolder,
        getHealth: () => healthPing.getHealth(),
        recheckHealth: () => healthPing.recheck(),
        fileWatcher,
        logger
      })
    ),
    surfaceVisibility
  );

  const openHomeTab = (): void => {
    EditorTabPanel.createOrShow(context.extensionUri, handleMessage, (visible) =>
      setSurfaceVisible("editor", visible)
    );
    healthPing.pushCurrentHealth();
  };

  currentFolder = await boot({
    wsResolver,
    workspaceState,
    stateFile,
    fileWatcher,
    healthPing,
    runtimeLifecycle,
    broadcaster,
    statusBar,
    router: routerHolder.router!,
    logger,
    isSurfaceVisible: () => surfaceVisibility.isAnyVisible(),
    onFolderPathChange: (folderPath) => {
      const prevFolder = currentFolder;
      currentFolder = folderPath;
      void syncBackgroundWork();
      if (folderPath && folderPath !== prevFolder) {
        const seen = context.globalState.get<string[]>(STATE_KEYS.seenFolders, []);
        const isNew = !seen.includes(folderPath);
        if (isNew) {
          void context.globalState.update(STATE_KEYS.seenFolders, [...seen, folderPath]);
        }
        if (isNew || isVindicateProject(folderPath)) {
          openHomeTab();
        }
      }
    }
  });

  await routerHolder.router.syncWebviewState(currentFolder);

  // Case 1: first install — open as a welcome page once ever.
  const homeShown = context.globalState.get<boolean>(STATE_KEYS.homeShown, false);
  if (!homeShown) {
    await context.globalState.update(STATE_KEYS.homeShown, true);
    try {
      const pkg = JSON.parse(readFileSync(path.join(context.extensionPath, "package.json"), "utf8")) as { version?: string };
      logger.info(`First install detected — extension version ${pkg.version ?? "unknown"}`);
    } catch {
      logger.info("First install detected — extension version unknown");
    }
    openHomeTab();
    return;
  }

  // Case 2: folder opened for the first time with Vindicate (never seen before).
  // Case 3: folder is an Vindicate-configured project — open as the project dashboard.
  if (currentFolder) {
    const seen = context.globalState.get<string[]>(STATE_KEYS.seenFolders, []);
    const isNew = !seen.includes(currentFolder);
    if (isNew) {
      void context.globalState.update(STATE_KEYS.seenFolders, [...seen, currentFolder]);
    }
    if (isNew || isVindicateProject(currentFolder)) {
      openHomeTab();
    }
  }
}

export function deactivate(): void {
  // Subscriptions dispose workerManager and workerLifecycle on deactivate.
}

/** Returns true when the folder has a .vindicate/state.json written by the extension. */
function isVindicateProject(folderPath: string): boolean {
  return existsSync(path.join(folderPath, ".vindicate", "state.json"));
}

import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRouter } from "../../../src/extension/views/MessageRouter";
import type { IWorkspaceStateService } from "../../../src/extension/shared/WorkspaceStateService";
import type { IStateFileService } from "../../../src/extension/shared/StateFileService";
import type { IBroadcaster } from "../../../src/extension/views/Broadcaster";
import type { ITelemetryService } from "../../../src/extension/telemetry/TelemetryService";
import type { IConfigStatusService } from "../../../src/extension/config/ConfigStatusService";
import type { IToolDetector } from "../../../src/extension/config/ToolDetector";
import type { IFileWatcherService } from "../../../src/extension/filesystem/FileWatcherService";
import { DashboardMetricsCache } from "../../../src/extension/views/DashboardMetricsCache";
import { collectProjectTestFiles } from "../../../src/extension/filesystem/projectTestFiles.js";
import { __getTerminalCalls, __resetVscodeMock } from "../../mocks/vscode";

vi.mock("../../../src/extension/filesystem/projectTestFiles.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/extension/filesystem/projectTestFiles.js")>();
  return {
    ...actual,
    collectProjectTestFiles: vi.fn()
  };
});

describe("MessageRouter", () => {
  // Complex vscode-dependent interfaces are cast via `as unknown as Interface`.
  // Simple pure interfaces are fully satisfied so TypeScript catches shape regressions.
  const workspaceState: IWorkspaceStateService = {
    getPromptTemplates: vi.fn().mockReturnValue([]),
    setPromptTemplates: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    setToolsConfirmed: vi.fn().mockResolvedValue(undefined),
    markStepDone: vi.fn().mockResolvedValue(undefined),
    unmarkStep: vi.fn().mockResolvedValue(undefined),
    clearOnboardingDone: vi.fn().mockResolvedValue(undefined),
    setOnboardingDone: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({
      selectedMode: "build",
      completedSteps: [],
      onboardingDone: false,
      toolsConfirmed: false
    })
  };

  const stateFile: IStateFileService = {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue({})
  };

  const mcpWriter = {
    write: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const ruleWriter = {
    write: vi.fn().mockResolvedValue({ ok: true }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const agentMdWriter = {
    write: vi.fn().mockResolvedValue({ ok: true }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const copilotWriter = {
    write: vi.fn().mockResolvedValue({ ok: true }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const skillWriter = {
    write: vi.fn().mockResolvedValue({ ok: true, alreadyPresent: false }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const antigravityAgentsMdWriter = {
    write: vi.fn().mockResolvedValue({ ok: true, alreadyPresent: false }),
    isConfigured: vi.fn().mockResolvedValue(false)
  };

  const statusBar = {
    setState: vi.fn(),
    setServiceHealth: vi.fn(),
    dispose: vi.fn()
  };

  const fileWatcher = {
    refresh: vi.fn().mockResolvedValue(undefined)
  } as unknown as IFileWatcherService;

  const metricsCache = new DashboardMetricsCache();

  const broadcaster: IBroadcaster = {
    broadcast: vi.fn()
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn()
  };

  const telemetry: ITelemetryService = {
    track: vi.fn()
  };

  const toolDetector: IToolDetector = {
    detect: vi.fn().mockResolvedValue({
      cursor: true,
      vscodeNative: false,
      claudeCode: false,
      antigravity: false
    })
  };

  const runtimeLifecycle = {
    ensureMcpReady: vi.fn().mockResolvedValue(true)
  };

  const getHealth = vi.fn().mockReturnValue({
    runtime: "up" as const,
    mcp: "up" as const
  });

  const configStatus: IConfigStatusService = {
    getStatuses: vi.fn().mockResolvedValue({
      cursor: false,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    }),
    getDefaultToolSelection: vi.fn().mockResolvedValue({
      cursor: true,
      vscode: false,
      claudeCode: false,
      antigravity: false
    })
  };

  let router: MessageRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetVscodeMock();
    vi.mocked(collectProjectTestFiles).mockResolvedValue([]);
    router = new MessageRouter(
      workspaceState,
      stateFile,
      runtimeLifecycle as never,
      mcpWriter as never,
      ruleWriter as never,
      agentMdWriter as never,
      copilotWriter as never,
      skillWriter as never,
      antigravityAgentsMdWriter as never,
      fileWatcher,
      broadcaster,
      logger as never,
      telemetry,
      toolDetector,
      configStatus,
      metricsCache,
      statusBar as never,
      getHealth
    );
  });

  it("handle ready syncs full webview state", async () => {
    await router.handle({ type: "ready" }, "/project");
    expect(fileWatcher.refresh).toHaveBeenCalled();
    expect(configStatus.getStatuses).toHaveBeenCalledWith("/project");
    expect(configStatus.getDefaultToolSelection).toHaveBeenCalled();
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace:resolved",
        hasFolder: true,
        folderName: "project",
        folderPath: "/project"
      })
    );
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "config:status" })
    );
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "onboarding:toolsDetected" })
    );
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "navigate:screen" })
    );
  });

  it("handle markStepDone persists state and broadcasts", async () => {
    await router.handle({ type: "onboarding:markStepDone", step: 2 }, "/project");
    expect(workspaceState.markStepDone).toHaveBeenCalledWith(2);
    expect(stateFile.write).toHaveBeenCalled();
    expect(telemetry.track).toHaveBeenCalledWith("step_completed", { step: "2" });
    expect(broadcaster.broadcast).toHaveBeenCalledWith({ type: "onboarding:stepDone", step: 2 });
  });

  it("handle tests:runAll without suites runs the full suite", async () => {
    await router.handle({ type: "tests:runAll" }, "/project");
    const calls = __getTerminalCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("Vindicate Tests");
    expect(calls[0]?.cwd).toBe("/project");
    expect(calls[0]?.texts).toEqual(["npx playwright test"]);
    expect(telemetry.track).toHaveBeenCalledWith("metrics_refreshed");
  });

  it("handle tests:runAll with a subset sends allowlisted file args", async () => {
    const folder = path.resolve("/project");
    vi.mocked(collectProjectTestFiles).mockResolvedValue([
      path.join(folder, "tests", "smoke.spec.ts"),
      path.join(folder, "tests", "login.spec.ts")
    ]);
    await router.handle({ type: "tests:runAll", suites: ["tests/smoke.spec.ts"] }, folder);
    expect(__getTerminalCalls()[0]?.texts).toEqual(["npx playwright test tests/smoke.spec.ts"]);
  });

  it("handle metrics:refresh delegates to fileWatcher and tracks telemetry", async () => {
    await router.handle({ type: "metrics:refresh" }, "/project");
    expect(fileWatcher.refresh).toHaveBeenCalled();
    expect(telemetry.track).toHaveBeenCalledWith("metrics_refreshed");
  });

  it("handle config:resyncMcp removes then rewrites target", async () => {
    await router.handle({ type: "config:resyncMcp", tool: "cursor" }, "/project");
    expect(mcpWriter.remove).toHaveBeenCalled();
    expect(mcpWriter.write).toHaveBeenCalled();
    expect(ruleWriter.write).toHaveBeenCalledWith("/project");
    expect(configStatus.getStatuses).toHaveBeenCalledWith("/project");
  });

  it("handle config:disconnectMcp removes target", async () => {
    await router.handle({ type: "config:disconnectMcp", tool: "cursor" }, "/project");
    expect(mcpWriter.remove).toHaveBeenCalled();
    expect(configStatus.getStatuses).toHaveBeenCalledWith("/project");
  });

  it("handle config:addMcp writes Cursor companion rule", async () => {
    await router.handle({ type: "config:addMcp", tool: "cursor" }, "/project");
    expect(ruleWriter.write).toHaveBeenCalledWith("/project");
  });

  it("handle config:addMcp writes Claude Code companion doc", async () => {
    await router.handle({ type: "config:addMcp", tool: "claudeCode" }, "/project");
    expect(agentMdWriter.write).toHaveBeenCalledWith("/project");
  });

  it("handle config:addMcp broadcasts success operation result", async () => {
    await router.handle({ type: "config:addMcp", tool: "cursor" }, "/project");
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "config:operationResult",
        tool: "cursor",
        operation: "add",
        ok: true
      })
    );
  });

  it("handle config:addMcp broadcasts failure operation result", async () => {
    vi.mocked(mcpWriter.write).mockResolvedValueOnce({ ok: false, error: "write failed" });
    await router.handle({ type: "config:addMcp", tool: "cursor" }, "/project");
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "config:operationResult",
        tool: "cursor",
        operation: "add",
        ok: false
      })
    );
  });

  it("handle logs:open shows output channel", async () => {
    await router.handle({ type: "logs:open" }, null);
    expect(logger.show).toHaveBeenCalled();
  });

  it("handle confirmTools sets toolsConfirmed and navigates to modeSelection", async () => {
    await router.handle(
      {
        type: "onboarding:confirmTools",
        tools: { cursor: true, vscode: false, claudeCode: false }
      },
      "/project"
    );
    expect(workspaceState.setToolsConfirmed).toHaveBeenCalled();
    expect(broadcaster.broadcast).toHaveBeenCalledWith({
      type: "navigate:screen",
      screen: "modeSelection"
    });
  });

  it("handle confirmTools only writes agent.md when Claude Code is selected", async () => {
    vi.mocked(toolDetector.detect).mockResolvedValue({
      cursor: false,
      vscodeNative: false,
      claudeCode: true
    });

    await router.handle(
      {
        type: "onboarding:confirmTools",
        tools: { cursor: false, vscode: false, claudeCode: false }
      },
      "/project"
    );
    expect(agentMdWriter.write).not.toHaveBeenCalled();
    expect(ruleWriter.write).not.toHaveBeenCalled();

    vi.mocked(toolDetector.detect).mockResolvedValue({
      cursor: true,
      vscodeNative: false,
      claudeCode: true
    });

    await router.handle(
      {
        type: "onboarding:confirmTools",
        tools: { cursor: true, vscode: false, claudeCode: true }
      },
      "/project"
    );
    expect(ruleWriter.write).toHaveBeenCalledWith("/project");
    expect(agentMdWriter.write).toHaveBeenCalledWith("/project");
  });

  it("handle selectMode persists mode and navigates to scaffold", async () => {
    await router.handle({ type: "onboarding:selectMode", mode: "build" }, "/project");
    expect(workspaceState.setMode).toHaveBeenCalledWith("build");
    expect(telemetry.track).toHaveBeenCalledWith("mode_selected", { mode: "build" });
    expect(broadcaster.broadcast).toHaveBeenCalledWith({
      type: "navigate:screen",
      screen: "scaffold"
    });
  });
});

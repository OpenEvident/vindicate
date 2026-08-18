import * as vscode from "vscode";
import path from "node:path";
import { buildMcpTargets } from "../config/MCP_TARGETS";
import type { IAgentSkillWriter } from "../config/AgentSkillWriter";
import type { IAntigravityAgentsMdWriter } from "../config/AntigravityAgentsMdWriter";
import type { IConfigStatusService } from "../config/ConfigStatusService";
import type { IMcpConfigWriter } from "../config/McpConfigWriter";
import type { IClaudeMdWriter } from "../config/ClaudeMdWriter";
import type { ICopilotInstructionsWriter } from "../config/CopilotInstructionsWriter";
import type { ICursorRuleWriter } from "../config/CursorRuleWriter";
import type { IToolDetector } from "../config/ToolDetector";
import type { IFileWatcherService } from "../filesystem/FileWatcherService";
import { COMMANDS } from "../shared/constants";
import type { ILogger } from "../shared/logger";
import type { WebviewMessage } from "../shared/messages";
import type { Mode, McpToolName, PromptTemplate, ServiceHealth, StepId } from "../shared/types";
import type { IStateFileService } from "../shared/StateFileService";
import type { ITelemetryService } from "../telemetry/TelemetryService";
import type { IWorkspaceStateService } from "../shared/WorkspaceStateService";
import type { IBroadcaster } from "./Broadcaster";
import type { DashboardMetricsCache } from "./DashboardMetricsCache";
import type { VindicateStatusBarItem } from "./StatusBarItem";
import type { RuntimeLifecycle } from "../processes/RuntimeLifecycle";
import { syncWebviewState } from "./syncWebviewState";
import { collectProjectTestFiles } from "../filesystem/projectTestFiles.js";
import {
  buildPlaywrightTestCommand,
  toPosixRelative
} from "../filesystem/playwrightTestCommand.js";

type CompanionWriteResult = {
  ok: boolean;
  warnings: string[];
};

export class MessageRouter {
  constructor(
    private readonly workspaceState: IWorkspaceStateService,
    private readonly stateFile: IStateFileService,
    private readonly runtimeLifecycle: RuntimeLifecycle,
    private readonly mcpWriter: IMcpConfigWriter,
    private readonly ruleWriter: ICursorRuleWriter,
    private readonly claudeMdWriter: IClaudeMdWriter,
    private readonly copilotWriter: ICopilotInstructionsWriter,
    private readonly skillWriter: IAgentSkillWriter,
    private readonly antigravityAgentsMdWriter: IAntigravityAgentsMdWriter,
    private readonly fileWatcher: IFileWatcherService,
    private readonly broadcaster: IBroadcaster,
    private readonly logger: ILogger,
    private readonly telemetry: ITelemetryService,
    private readonly toolDetector: IToolDetector,
    private readonly configStatus: IConfigStatusService,
    private readonly metricsCache: DashboardMetricsCache,
    private readonly statusBar: VindicateStatusBarItem,
    private readonly getHealth: () => ServiceHealth
  ) {}

  async handle(msg: WebviewMessage, folderPath: string | null): Promise<void> {
    switch (msg.type) {
      case "ready":
        return this.handleReady(folderPath);
      case "onboarding:selectMode":
        return this.handleModeSelect(msg.mode, folderPath);
      case "onboarding:confirmTools":
        return this.handleConfirmTools(msg.tools, folderPath);
      case "onboarding:resetMode":
        return this.handleResetMode(folderPath);
      case "onboarding:markStepDone":
        return this.handleMarkStepDone(msg.step, folderPath);
      case "onboarding:markOnboardingDone":
        return this.handleMarkOnboardingDone(folderPath);
      case "config:addMcp":
        return this.handleAddMcp(msg.tool, folderPath);
      case "config:resyncMcp":
        return this.handleResyncMcp(msg.tool, folderPath);
      case "config:disconnectMcp":
        return this.handleDisconnectMcp(msg.tool, folderPath);
      case "prompts:saveTemplates":
        return this.handleSavePromptTemplates(msg.templates);
      case "metrics:refresh":
        return this.handleMetricsRefresh(folderPath);
      case "tests:runAll":
        return this.handleRunAllTests(folderPath, msg.suites);
      case "nav:openFolder":
        return void vscode.commands.executeCommand("vscode.openFolder");
      case "nav:openFile":
        return this.handleOpenFile(folderPath, msg.file, msg.line);
      case "nav:openFullView":
        return void vscode.commands.executeCommand(COMMANDS.openHome);
      case "nav:showPanel":
        return void vscode.commands.executeCommand(COMMANDS.showPanel);
      case "nav:openRecordings":
        return void vscode.commands.executeCommand(COMMANDS.openRecordings);
      case "nav:openDocs":
        return void vscode.env.openExternal(vscode.Uri.parse("https://vindicate.ai/docs"));
      case "nav:openWebsite":
        return void vscode.env.openExternal(vscode.Uri.parse("https://vindicate.ai"));
      case "nav:reportProblem":
        return void vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/OpenEvident/vindicate/issues")
        );
      case "nav:openRecentFolder":
        return void vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(msg.path),
          false
        );
      case "logs:open":
        return void this.logger.show();
      case "finalize":
      case "refresh":
      case "list_recordings":
      case "start_recording":
      case "stop_recording":
      case "take_snapshot":
      case "webview_client_error":
      case "discard":
      case "delete_recording":
      case "open_recording":
      case "load_recording_session":
      case "copy_path":
      case "annotate":
        return;
      default: {
        const _exhaustive: never = msg;
        return void _exhaustive;
      }
    }
  }

  async broadcastConfigStatus(folderPath: string | null): Promise<void> {
    const statuses = await this.configStatus.getStatuses(folderPath);
    this.broadcaster.broadcast({ type: "config:status", statuses });
  }

  async broadcastToolsDetected(): Promise<void> {
    const tools = await this.configStatus.getDefaultToolSelection();
    this.broadcaster.broadcast({ type: "onboarding:toolsDetected", tools });
  }

  async syncWebviewState(folderPath: string | null): Promise<void> {
    await syncWebviewState({
      workspaceState: this.workspaceState,
      configStatus: this.configStatus,
      broadcaster: this.broadcaster,
      metricsCache: this.metricsCache,
      folderPath,
      getHealth: this.getHealth
    });
  }

  private async handleReady(folderPath: string | null): Promise<void> {
    await this.syncWebviewState(folderPath);
    void this.broadcastRecentFolders();
    if (folderPath && !this.metricsCache.get()) {
      await this.fileWatcher.refresh();
    }
  }

  private async broadcastRecentFolders(): Promise<void> {
    try {
      const result = await vscode.commands.executeCommand<{
        workspaces?: Array<{ folderUri?: { fsPath: string }; workspace?: unknown }>;
      }>("_workbench.recentlyOpenedWorkspaces");
      const folders: string[] = [];
      for (const entry of result?.workspaces ?? []) {
        if (entry.folderUri?.fsPath) {
          folders.push(entry.folderUri.fsPath);
        }
      }
      if (folders.length > 0) {
        this.broadcaster.broadcast({ type: "workspace:recentFolders", folders });
      }
    } catch {
      // Internal API — silently ignore if unavailable
    }
  }

  private async handleModeSelect(mode: Mode, folderPath: string | null): Promise<void> {
    await this.workspaceState.setMode(mode);
    this.telemetry.track("mode_selected", { mode });
    await this.persistState(folderPath);
    this.broadcaster.broadcast({
      type: "onboarding:stateSync",
      state: this.workspaceState.getState()
    });
    this.broadcaster.broadcast({ type: "navigate:screen", screen: "scaffold" });
  }

  private async handleMarkOnboardingDone(folderPath: string | null): Promise<void> {
    for (const step of [1, 2, 3, 4] as const) {
      await this.workspaceState.markStepDone(step);
    }
    await this.workspaceState.setOnboardingDone();
    this.statusBar.setState("active");
    this.telemetry.track("onboarding_finished", { method: "manual" });
    await this.persistState(folderPath);
    this.broadcaster.broadcast({
      type: "onboarding:stateSync",
      state: this.workspaceState.getState()
    });
    this.broadcaster.broadcast({ type: "navigate:screen", screen: "dashboard" });
  }

  private async handleConfirmTools(
    tools: { cursor: boolean; vscode: boolean; claudeCode: boolean; antigravity: boolean },
    folderPath: string | null
  ): Promise<void> {
    const targets = buildMcpTargets(folderPath);
    // Respect the user's explicit selection regardless of detection status.
    // Detection only informs the default UI state; the user may choose an
    // agent that wasn't auto-detected (e.g. not yet launched, global install).
    const map: Record<McpToolName, boolean> = {
      cursor: tools.cursor,
      vscode: tools.vscode,
      claudeCode: tools.claudeCode,
      antigravity: tools.antigravity
    };

    const wantsMcp = Object.values(map).some(Boolean);
    if (wantsMcp) {
      const ready = await this.runtimeLifecycle.ensureMcpReady(folderPath);
      if (!ready) {
        return;
      }
      await this.writeMcpTargets(targets, map);
      void vscode.window.showInformationMessage(
        "Vindicate MCP is running. If your AI tool still shows an MCP error, try toggling Vindicate off and on in its MCP settings."
      );
    }

    if (folderPath && map.cursor) {
      const ruleResult = await this.ruleWriter.write(folderPath);
      if (!ruleResult.ok) {
        void vscode.window.showWarningMessage(`Failed to write Cursor rule: ${ruleResult.error}`);
      }
    }

    if (folderPath && map.vscode) {
      const copilotResult = await this.copilotWriter.write(folderPath);
      if (!copilotResult.ok) {
        void vscode.window.showWarningMessage(
          `Failed to write Copilot instructions: ${copilotResult.error}`
        );
      }
    }

    if (folderPath && map.claudeCode) {
      const agentResult = await this.claudeMdWriter.write(folderPath);
      if (!agentResult.ok) {
        void vscode.window.showWarningMessage(`Failed to update agent file: ${agentResult.error}`);
      }
    }

    if (folderPath && map.antigravity) {
      const agentsMdResult = await this.antigravityAgentsMdWriter.write(folderPath);
      if (!agentsMdResult.ok) {
        void vscode.window.showWarningMessage(`Failed to write AGENTS.md: ${agentsMdResult.error}`);
      }
    }

    if (folderPath) {
      for (const [toolName, selected] of Object.entries(map) as Array<[McpToolName, boolean]>) {
        if (selected) {
          const skillResult = await this.skillWriter.write(folderPath, toolName);
          if (!skillResult.ok) {
            void vscode.window.showWarningMessage(
              `Failed to write agent skill: ${skillResult.error}`
            );
          }
        }
      }
    }

    await this.workspaceState.setToolsConfirmed();
    await this.broadcastConfigStatus(folderPath);
    this.broadcaster.broadcast({ type: "navigate:screen", screen: "modeSelection" });
  }

  private async handleResetMode(folderPath: string | null): Promise<void> {
    await this.workspaceState.reset();
    await this.persistState(folderPath);
    this.broadcaster.broadcast({
      type: "onboarding:stateSync",
      state: this.workspaceState.getState()
    });
    this.broadcaster.broadcast({ type: "navigate:screen", screen: "modeSelection" });
  }

  private async handleMarkStepDone(step: StepId, folderPath: string | null): Promise<void> {
    await this.workspaceState.markStepDone(step);
    await this.persistState(folderPath);
    this.telemetry.track("step_completed", { step: String(step) });
    this.broadcaster.broadcast({ type: "onboarding:stepDone", step });
  }

  private async handleAddMcp(tool: McpToolName, folderPath: string | null): Promise<void> {
    const target = buildMcpTargets(folderPath).find((t) => targetKey(t.name) === tool);
    if (!target) {
      this.broadcastConfigOperationResult(tool, "add", false, "Unsupported MCP target.");
      return;
    }
    const ready = await this.runtimeLifecycle.ensureMcpReady(folderPath);
    if (!ready) {
      this.broadcastConfigOperationResult(tool, "add", false, "MCP runtime is not ready.");
      return;
    }

    const result = await this.mcpWriter.write(target);
    if (!result.ok) {
      void vscode.window.showWarningMessage(`Failed to write MCP config: ${result.error}`);
      await this.broadcastConfigStatus(folderPath);
      this.broadcastConfigOperationResult(tool, "add", false, `Failed to add ${target.name}.`);
      return;
    }

    this.telemetry.track("config_written", { target: tool });
    const companions = await this.writeCompanionArtifactsForTool(tool, folderPath);
    const message =
      companions.ok && result.alreadyPresent
        ? `${target.name} already configured.`
        : companions.ok
          ? `${target.name} configured.`
          : `${target.name} configured with warnings.`;
    if (!companions.ok) {
      void vscode.window.showWarningMessage(companions.warnings.join(" "));
    } else {
      void vscode.window.showInformationMessage(
        "MCP config updated. If your AI tool still shows an MCP error, try toggling Vindicate off and on in its MCP settings."
      );
    }
    await this.broadcastConfigStatus(folderPath);
    this.broadcastConfigOperationResult(tool, "add", companions.ok, message);
  }

  private async handleResyncMcp(tool: McpToolName, folderPath: string | null): Promise<void> {
    const target = buildMcpTargets(folderPath).find((t) => targetKey(t.name) === tool);
    if (!target) {
      this.broadcastConfigOperationResult(tool, "resync", false, "Unsupported MCP target.");
      return;
    }
    const ready = await this.runtimeLifecycle.ensureMcpReady(folderPath);
    if (!ready) {
      this.broadcastConfigOperationResult(tool, "resync", false, "MCP runtime is not ready.");
      return;
    }

    const removeResult = await this.mcpWriter.remove(target);
    if (!removeResult.ok) {
      void vscode.window.showWarningMessage(`Failed to re-sync MCP config: ${removeResult.error}`);
      await this.broadcastConfigStatus(folderPath);
      this.broadcastConfigOperationResult(
        tool,
        "resync",
        false,
        `Failed to re-sync ${target.name}.`
      );
      return;
    }

    const writeResult = await this.mcpWriter.write(target);
    if (!writeResult.ok) {
      void vscode.window.showWarningMessage(`Failed to re-sync MCP config: ${writeResult.error}`);
      await this.broadcastConfigStatus(folderPath);
      this.broadcastConfigOperationResult(
        tool,
        "resync",
        false,
        `Failed to re-sync ${target.name}.`
      );
      return;
    }

    this.telemetry.track("config_written", { target: `${tool}:resync` });
    const companions = await this.writeCompanionArtifactsForTool(tool, folderPath);
    if (!companions.ok) {
      void vscode.window.showWarningMessage(companions.warnings.join(" "));
    } else {
      void vscode.window.showInformationMessage("MCP config re-synced.");
    }
    await this.broadcastConfigStatus(folderPath);
    this.broadcastConfigOperationResult(
      tool,
      "resync",
      companions.ok,
      companions.ok ? `${target.name} re-synced.` : `${target.name} re-synced with warnings.`
    );
  }

  private async handleDisconnectMcp(tool: McpToolName, folderPath: string | null): Promise<void> {
    const target = buildMcpTargets(folderPath).find((t) => targetKey(t.name) === tool);
    if (!target) {
      this.broadcastConfigOperationResult(tool, "disconnect", false, "Unsupported MCP target.");
      return;
    }
    const result = await this.mcpWriter.remove(target);
    if (!result.ok) {
      void vscode.window.showWarningMessage(`Failed to disconnect MCP target: ${result.error}`);
      await this.broadcastConfigStatus(folderPath);
      this.broadcastConfigOperationResult(
        tool,
        "disconnect",
        false,
        `Failed to disconnect ${target.name}.`
      );
      return;
    } else {
      this.telemetry.track("config_written", { target: `${tool}:disconnect` });
      void vscode.window.showInformationMessage("MCP target disconnected.");
    }
    await this.broadcastConfigStatus(folderPath);
    this.broadcastConfigOperationResult(tool, "disconnect", true, `${target.name} disconnected.`);
  }

  private async writeMcpTargets(
    targets: ReturnType<typeof buildMcpTargets>,
    map: Record<McpToolName, boolean>
  ): Promise<void> {
    for (const target of targets) {
      const key = targetKey(target.name);
      if (!key || !map[key]) continue;
      const result = await this.mcpWriter.write(target);
      if (result.ok) this.telemetry.track("config_written", { target: target.name });
      else {
        void vscode.window.showWarningMessage(
          `Failed to write MCP config at ${target.configPath}: ${result.error}`
        );
      }
    }
  }

  private async writeCompanionArtifactsForTool(
    tool: McpToolName,
    folderPath: string | null
  ): Promise<CompanionWriteResult> {
    if (!folderPath) return { ok: true, warnings: [] };
    const warnings: string[] = [];

    if (tool === "cursor") {
      const ruleResult = await this.ruleWriter.write(folderPath);
      if (!ruleResult.ok) {
        warnings.push(`Failed to write Cursor rule: ${ruleResult.error}`);
      }
    }

    if (tool === "vscode") {
      const copilotResult = await this.copilotWriter.write(folderPath);
      if (!copilotResult.ok) {
        warnings.push(`Failed to write Copilot instructions: ${copilotResult.error}`);
      }
    }

    if (tool === "claudeCode") {
      const agentResult = await this.claudeMdWriter.write(folderPath);
      if (!agentResult.ok) {
        warnings.push(`Failed to update agent file: ${agentResult.error}`);
      }
    }

    if (tool === "antigravity") {
      const agentsMdResult = await this.antigravityAgentsMdWriter.write(folderPath);
      if (!agentsMdResult.ok) {
        warnings.push(`Failed to write AGENTS.md: ${agentsMdResult.error}`);
      }
    }

    const skillResult = await this.skillWriter.write(folderPath, tool);
    if (!skillResult.ok) {
      warnings.push(`Failed to write agent skill: ${skillResult.error}`);
    }

    return { ok: warnings.length === 0, warnings };
  }

  private broadcastConfigOperationResult(
    tool: McpToolName,
    operation: "add" | "resync" | "disconnect",
    ok: boolean,
    message?: string
  ): void {
    this.broadcaster.broadcast({
      type: "config:operationResult",
      tool,
      operation,
      ok,
      ...(message !== undefined ? { message } : {})
    });
  }

  private async handleSavePromptTemplates(templates: PromptTemplate[]): Promise<void> {
    await this.workspaceState.setPromptTemplates(templates);
    this.broadcaster.broadcast({ type: "prompts:templates", templates });
  }

  private async handleMetricsRefresh(folderPath: string | null): Promise<void> {
    await this.fileWatcher.refresh(folderPath ?? undefined);
    this.telemetry.track("metrics_refreshed");
  }

  private async handleRunAllTests(
    folderPath: string | null,
    suites?: string[]
  ): Promise<void> {
    if (!folderPath) return;
    const knownAbs = await collectProjectTestFiles(folderPath);
    const knownRel = knownAbs.map((abs) => toPosixRelative(folderPath, abs));
    const command = buildPlaywrightTestCommand(suites, knownRel);
    const terminal = vscode.window.createTerminal({
      name: "Vindicate Tests",
      cwd: folderPath
    });
    terminal.show(true);
    terminal.sendText(command);
    this.telemetry.track("metrics_refreshed");
  }

  private async handleOpenFile(
    folderPath: string | null,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!folderPath) return;
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(folderPath, filePath);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    const targetLine = Math.max(0, (line ?? 1) - 1);
    const range = new vscode.Range(targetLine, 0, targetLine, 0);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  private async persistState(folderPath: string | null): Promise<void> {
    if (!folderPath) return;
    await this.stateFile.write(folderPath, this.workspaceState.getState());
  }
}

function targetKey(name: string): McpToolName | null {
  if (name === "Cursor") return "cursor";
  if (name === "VS Code") return "vscode";
  if (name === "Claude Code") return "claudeCode";
  if (name === "Antigravity") return "antigravity";
  return null;
}

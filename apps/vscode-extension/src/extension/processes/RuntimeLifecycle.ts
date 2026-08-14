import * as vscode from "vscode";
import { VindicateError } from "../shared/errors";
import { RUNTIME_ERROR_CODES } from "../shared/runtimeErrors";
import type { ILogger } from "../shared/logger";
import { getOrCreateSharedWorkerKey } from "../shared/sharedWorkerKey";
import type { VindicateStatusBarItem } from "../views/StatusBarItem";
import type { McpManager } from "./McpManager";
import type { WorkerManager } from "./WorkerManager";

export interface RuntimeLifecycleDeps {
  workerManager: WorkerManager;
  mcpManager: McpManager;
  logger: ILogger;
  statusBar: VindicateStatusBarItem;
  getFolderPath: () => string | null;
  /** Absolute path to the session log file shared with child processes via VINDICATE_LOG_FILE. */
  logFile: string | undefined;
}

/**
 * Starts runtime-worker/runtime-mcp as soon as a workspace folder is open.
 * MCP client config must only be written after MCP is healthy (see ensureMcpReady).
 */
export class RuntimeLifecycle implements vscode.Disposable {
  private isStarting = false;
  private lastFolderPath: string | null = null;

  constructor(private readonly deps: RuntimeLifecycleDeps) {}

  async start(folderPath: string | null): Promise<void> {
    if (this.isStarting) {
      this.deps.logger.info("[RuntimeLifecycle] Startup already in progress — skipping.");
      return;
    }

    this.isStarting = true;
    try {
      const env = await this.buildSharedEnv(folderPath);
      this.deps.logger.info("Starting runtime-worker.");
      await this.deps.workerManager.start(env);
      await this.deps.workerManager.waitUntilHealthy();
      this.deps.workerManager.startEventSubscription();

      if (folderPath) {
        await this.startMcp(folderPath);
      }

      this.lastFolderPath = folderPath;
    } catch (err) {
      this.deps.logger.error(`[RuntimeLifecycle] ${String(err)}`);
      this.deps.statusBar.setState("error");
      await this.showStartError(err, folderPath);
    } finally {
      this.isStarting = false;
    }
  }

  async restartForFolder(folderPath: string | null): Promise<void> {
    if (!folderPath) {
      await this.deps.mcpManager.stop();
      this.lastFolderPath = null;
      return;
    }

    if (
      folderPath === this.lastFolderPath &&
      this.deps.mcpManager.currentState === "running" &&
      this.deps.mcpManager.projectRoot === folderPath
    ) {
      return;
    }

    try {
      await this.startMcp(folderPath);
      this.lastFolderPath = folderPath;
    } catch (err) {
      this.deps.logger.error(`[RuntimeLifecycle] MCP restart failed: ${String(err)}`);
      this.deps.statusBar.setState("error");
      await this.showStartError(err, folderPath);
    }
  }

  /**
   * Ensures MCP is up before writing Cursor/VS Code mcp.json entries.
   * Returns false when there is no folder or startup failed.
   */
  async ensureMcpReady(folderPath: string | null): Promise<boolean> {
    if (!folderPath) {
      void vscode.window.showWarningMessage(
        "Open a workspace folder before configuring MCP — Vindicate MCP needs a project root."
      );
      return false;
    }

    try {
      if (this.deps.workerManager.currentState !== "running") {
        await this.start(folderPath);
      } else if (this.deps.mcpManager.currentState !== "running") {
        await this.startMcp(folderPath);
      } else {
        await this.deps.mcpManager.waitUntilHealthy(10_000);
      }
      return true;
    } catch (err) {
      this.deps.logger.error(`[RuntimeLifecycle.ensureMcpReady] ${String(err)}`);
      void vscode.window.showErrorMessage(
        "Vindicate MCP is not ready yet. Check the Vindicate output log, then try again from Prompts & Config."
      );
      return false;
    }
  }

  dispose(): void {
    void this.deps.mcpManager.stop();
    // The runtime worker is a machine-wide singleton other editor windows may
    // depend on — closing this window must not kill it. It reaps itself via
    // idle self-shutdown once no editor is pinging it.
  }

  private async startMcp(folderPath: string): Promise<void> {
    const env = await this.buildSharedEnv(folderPath);
    env.VINDICATE_PROJECT_ROOT = folderPath;
    this.deps.logger.info("Starting runtime-mcp.");
    await this.deps.mcpManager.start(env);
    await this.deps.mcpManager.waitUntilHealthy();
  }

  private async buildSharedEnv(folderPath: string | null): Promise<Record<string, string>> {
    const env: Record<string, string> = {
      VINDICATE_INTERNAL_KEY: await getOrCreateSharedWorkerKey()
    };
    if (folderPath) {
      env.VINDICATE_PROJECT_ROOT = folderPath;
    }
    if (this.deps.logFile) {
      env.VINDICATE_LOG_FILE = this.deps.logFile;
    }
    return env;
  }

  private async showStartError(err: unknown, folderPath: string | null): Promise<void> {
    const selection = await vscode.window.showErrorMessage(
      `Vindicate failed to start local services. ${getStartErrorMessage(err)}`,
      "Show Logs",
      "Retry"
    );
    if (selection === "Show Logs") {
      this.deps.logger.show();
    }
    if (selection === "Retry") {
      await this.start(folderPath);
    }
  }
}

function getStartErrorMessage(err: unknown): string {
  if (err instanceof VindicateError && err.code === RUNTIME_ERROR_CODES.runtimeEntryMissing) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

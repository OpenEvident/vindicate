import path from "node:path";
import { MCP_PORT } from "../shared/constants";
import type { ILogger } from "../shared/logger";
import { BaseProcessManager } from "./BaseProcessManager";

export class McpManager extends BaseProcessManager {
  private attachedToExisting = false;
  private lastProjectRoot: string | null = null;

  constructor(logger: ILogger, extensionPath: string) {
    super(logger, extensionPath);
  }

  get spawnedByExtension(): boolean {
    return !this.attachedToExisting && (this.hasSpawnedProcess || this.currentState === "running");
  }

  get projectRoot(): string | null {
    return this.lastProjectRoot;
  }

  override async start(extraEnv?: Record<string, string>): Promise<void> {
    const projectRoot = extraEnv?.VINDICATE_PROJECT_ROOT;
    if (!projectRoot) {
      throw new Error("VINDICATE_PROJECT_ROOT is required to start runtime-mcp.");
    }

    if (
      this.currentState === "running" &&
      this.lastProjectRoot === projectRoot &&
      (await this.isMcpReachable())
    ) {
      return;
    }

    if (this.currentState === "running" || this.hasSpawnedProcess) {
      await this.stop();
    }

    if (await this.isMcpReachable()) {
      this.logger.info(`[runtime-mcp] Using existing MCP server on :${MCP_PORT}`);
      this.attachedToExisting = true;
      this.lastProjectRoot = projectRoot;
      this.setState("running");
      return;
    }

    this.attachedToExisting = false;
    this.lastProjectRoot = projectRoot;
    await super.start(extraEnv);
  }

  /** Resolves when GET /health succeeds; rejects if the process exits or times out. */
  async waitUntilHealthy(timeoutMs = 45_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.currentState === "error" || this.currentState === "stopped") {
        throw new Error(
          "Runtime MCP exited before it became healthy. Open Vindicate output for the crash log."
        );
      }
      if (await this.isMcpReachable()) {
        return;
      }
      await delay(400);
    }
    throw new Error(`Runtime MCP did not become healthy within ${timeoutMs / 1000}s.`);
  }

  override async stop(): Promise<void> {
    if (this.attachedToExisting) {
      this.attachedToExisting = false;
      this.lastProjectRoot = null;
      this.setState("stopped");
      return;
    }
    await super.stop();
    this.lastProjectRoot = null;
  }

  protected getName(): string {
    return "runtime-mcp";
  }

  protected getBuildCommand(): string {
    return "pnpm --filter @vindicate/runtime-mcp run build:bundle && pnpm --filter vscode-extension build";
  }

  protected getEntryRelativePath(): string {
    return path.join("dist", "bundled", "runtime-mcp", "bundle.mjs");
  }

  private async isMcpReachable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`http://127.0.0.1:${MCP_PORT}/health`, {
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

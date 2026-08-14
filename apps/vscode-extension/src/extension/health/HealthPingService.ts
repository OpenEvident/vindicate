import * as vscode from "vscode";
import { HEALTH_PING_INTERVAL_MS, MCP_PORT, RUNTIME_PORT } from "../shared/constants";
import type { ServiceHealth } from "../../shared/types";
import type { ILogger } from "../shared/logger";
import type { IBroadcaster } from "../views/Broadcaster";

export class HealthPingService implements vscode.Disposable {
  private interval: NodeJS.Timeout | null = null;
  private readonly healthEmitter = new vscode.EventEmitter<ServiceHealth>();
  private lastHealth: ServiceHealth = {
    runtime: "unknown",
    mcp: "unknown"
  };

  readonly onDidHealthChange = this.healthEmitter.event;

  constructor(
    private readonly broadcaster: IBroadcaster,
    private readonly logger: ILogger
  ) {}

  getHealth(): ServiceHealth {
    return this.lastHealth;
  }

  /** Push last-known health to all webviews (e.g. after a surface mounts). */
  pushCurrentHealth(): void {
    this.broadcaster.broadcast({ type: "health:status", ...this.lastHealth });
  }

  start(): void {
    if (this.interval) return;
    void this.ping();
    this.interval = setInterval(() => void this.ping(), HEALTH_PING_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Last-known health is preserved — services may still be running.
  }

  /** Trigger an immediate health check outside the normal ping interval. */
  recheck(): void {
    void this.ping();
  }

  private async ping(): Promise<void> {
    const [runtime, mcp] = await Promise.all([
      this.checkPort(RUNTIME_PORT),
      this.checkMcpHealth()
    ]);
    const health: ServiceHealth = { runtime, mcp };
    this.publishHealth(health);
  }

  private publishHealth(health: ServiceHealth): void {
    this.lastHealth = health;
    this.healthEmitter.fire(health);
    this.broadcaster.broadcast({ type: "health:status", ...health });
  }

  private async checkPort(port: number): Promise<"up" | "down"> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2_000)
      });
      return res.ok ? "up" : "down";
    } catch {
      return "down";
    }
  }

  private async checkMcpHealth(): Promise<"up" | "down"> {
    try {
      const res = await fetch(`http://127.0.0.1:${MCP_PORT}/health`, {
        signal: AbortSignal.timeout(2_000)
      });
      return res.ok ? "up" : "down";
    } catch {
      return "down";
    }
  }

  dispose(): void {
    this.stop();
    this.healthEmitter.dispose();
  }
}

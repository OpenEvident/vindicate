import path from "node:path";
import { RUNTIME_PORT } from "../shared/constants";
import type { ILogger } from "../shared/logger";
import { BaseProcessManager } from "./BaseProcessManager";

export class WorkerManager extends BaseProcessManager {
  private attachedToExisting = false;
  private internalKey: string | undefined;
  private eventStreamActive = false;
  private readonly eventHandlers = new Set<(event: Record<string, unknown>) => void>();

  constructor(logger: ILogger, extensionPath: string) {
    super(logger, extensionPath);
  }

  getInternalKey(): string | undefined {
    return this.internalKey;
  }

  onWorkerEvent(handler: (event: Record<string, unknown>) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  startEventSubscription(): void {
    if (this.eventStreamActive) {
      return;
    }
    this.eventStreamActive = true;
    void this.openEventStream();
  }

  stopEventSubscription(): void {
    this.eventStreamActive = false;
    this.eventHandlers.clear();
  }

  get spawnedByExtension(): boolean {
    return !this.attachedToExisting && (this.hasSpawnedProcess || this.currentState === "running");
  }

  override async start(extraEnv?: Record<string, string>): Promise<void> {
    const internalKey = extraEnv?.VINDICATE_INTERNAL_KEY;
    if (internalKey !== undefined) {
      this.internalKey = internalKey;
    }

    // Already own a healthy worker from a previous start() call — nothing to
    // do. Without this guard, a redundant start() would re-run the reachability
    // probe below, see its own process answer, and misclassify it as an
    // external worker (attachedToExisting = true), which would then stop
    // stop()/dispose() from ever reaping the process this manager spawned.
    if (
      !this.attachedToExisting &&
      this.currentState === "running" &&
      this.hasSpawnedProcess &&
      (await this.isWorkerReachable())
    ) {
      return;
    }

    if (await this.isWorkerReachable()) {
      if (!internalKey || !(await this.acceptsInternalKey(internalKey))) {
        throw new Error(this.buildKeyMismatchMessage());
      }
      this.logger.info(`[runtime-worker] Using existing worker on :${RUNTIME_PORT}`);
      this.attachedToExisting = true;
      this.setState("running");
      return;
    }

    this.attachedToExisting = false;
    await super.start(extraEnv);
  }

  /** Resolves when GET /health succeeds; rejects if the process exits or times out. */
  async waitUntilHealthy(timeoutMs = 30_000): Promise<void> {
    if (this.attachedToExisting) {
      if (await this.isWorkerReachable()) {
        return;
      }
      throw new Error("Attached runtime worker is not responding on /health.");
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.currentState === "error" || this.currentState === "stopped") {
        // Our spawn may have lost a startup race to another editor launching
        // at the same moment (both saw the port free, only one wins the
        // listen()). Re-probe before failing — if a worker is now up and
        // accepts our (shared) key, attach to it instead of surfacing an error.
        if (
          this.internalKey !== undefined &&
          (await this.isWorkerReachable()) &&
          (await this.acceptsInternalKey(this.internalKey))
        ) {
          this.attachedToExisting = true;
          this.setState("running");
          return;
        }
        throw new Error(
          "Runtime worker exited before it became healthy. Open Vindicate output for the crash log."
        );
      }
      if (await this.isWorkerReachable()) {
        return;
      }
      await delay(400);
    }
    throw new Error(`Runtime worker did not become healthy within ${timeoutMs / 1000}s.`);
  }

  override async stop(): Promise<void> {
    if (this.attachedToExisting) {
      this.attachedToExisting = false;
      this.setState("stopped");
      return;
    }
    await super.stop();
  }

  protected getName(): string {
    return "runtime-worker";
  }

  protected getBuildCommand(): string {
    return "pnpm --filter @vindicate/runtime-worker run build:bundle && pnpm --filter vscode-extension build";
  }

  protected getEntryRelativePath(): string {
    return path.join("dist", "bundled", "runtime-worker", "bundle.mjs");
  }

  /**
   * The internal key is now shared machine-wide (see sharedWorkerKey.ts), so a
   * genuine mismatch here means a process is squatting on the port that isn't
   * an Vindicate worker using the current key — e.g. a runtime-worker left over
   * from before an update to this shared-key scheme, or an unrelated process.
   */
  private buildKeyMismatchMessage(): string {
    return (
      `A process is already listening on :${RUNTIME_PORT} but rejected the Vindicate internal key. ` +
      "This is usually a leftover runtime-worker process from before an update, or another " +
      `process using this port. Stop whatever is listening on :${RUNTIME_PORT} and try again ` +
      `(Windows: "netstat -ano | findstr :${RUNTIME_PORT}" to find the PID, then ` +
      `"Stop-Process -Id <pid>"; macOS/Linux: "lsof -i :${RUNTIME_PORT}" then "kill <pid>").`
    );
  }

  private async isWorkerReachable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/health`, {
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async acceptsInternalKey(internalKey: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/capabilities`, {
        signal: controller.signal,
        headers: { "x-vindicate-internal-key": internalKey }
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async openEventStream(): Promise<void> {
    const url = `http://127.0.0.1:${RUNTIME_PORT}/events`;
    try {
      const response = await fetch(url, {
        headers: { "x-vindicate-internal-key": this.internalKey ?? "" }
      });
      if (response.body === null) {
        this.eventStreamActive = false;
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            try {
              const payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
              for (const handler of this.eventHandlers) {
                handler(payload);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
    } catch {
      /* reconnect after worker restarts */
    } finally {
      this.eventStreamActive = false;
      if (this.eventHandlers.size > 0) {
        setTimeout(() => {
          this.eventStreamActive = true;
          void this.openEventStream();
        }, 3000);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @file Per-session mutex with global resource governor gating (ARCHITECTURE §8.4, §9).
 */
import type { GovernorState, IResourceGovernor } from "../../../core/governor/resource-governor.interface.js";
import { SessionBusyError, WorkerThrottledError } from "../../../shared/errors/worker.errors.js";

export class BrowserQueue {
  private locked = false;

  constructor(private readonly governor: IResourceGovernor) {}

  tryAcquireForSession(sessionId: string): void {
    const g = this.governor.state;
    this.assertGovernorAllows(g);
    if (this.locked) {
      throw new SessionBusyError(sessionId);
    }
    this.locked = true;
  }

  release(): void {
    this.locked = false;
  }

  isBusy(): boolean {
    return this.locked;
  }

  private assertGovernorAllows(state: GovernorState): void {
    if (state === "reject") {
      throw new WorkerThrottledError("Worker is in resource reject state — retry later", 2000);
    }
    if (state === "warning") {
      throw new WorkerThrottledError("Worker is in resource warning state — retry later", 500);
    }
  }
}

export class BrowserQueueManager {
  private readonly queues = new Map<string, BrowserQueue>();

  constructor(private readonly governor: IResourceGovernor) {}

  forSession(sessionId: string): BrowserQueue {
    let q = this.queues.get(sessionId);
    if (q === undefined) {
      q = new BrowserQueue(this.governor);
      this.queues.set(sessionId, q);
    }
    return q;
  }

  dropSession(sessionId: string): void {
    this.queues.delete(sessionId);
  }

  async drainAll(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let busy = false;
      for (const q of this.queues.values()) {
        if (q.isBusy()) {
          busy = true;
          break;
        }
      }
      if (!busy) {
        return;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
      });
    }
    throw new Error("browser command queue drain timed out");
  }
}

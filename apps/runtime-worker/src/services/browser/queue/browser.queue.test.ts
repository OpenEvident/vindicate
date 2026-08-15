import { describe, expect, it } from "vitest";

import type {
  GovernorState,
  IResourceGovernor
} from "../../../core/governor/resource-governor.interface.js";
import { SessionBusyError, WorkerThrottledError } from "../../../shared/errors/worker.errors.js";
import { BrowserQueue } from "./browser.queue.js";

class FakeResourceGovernor implements IResourceGovernor {
  private _state: GovernorState = "normal";
  private readonly listeners = new Set<(state: GovernorState) => void>();

  get state(): GovernorState {
    return this._state;
  }

  onStateChange(callback: (state: GovernorState) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  setState(next: GovernorState): void {
    this._state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  stop(): void {
    /* noop */
  }
}

describe("BrowserQueue", () => {
  it("throws SessionBusyError when a second acquire happens while locked", () => {
    const gov = new FakeResourceGovernor();
    const q = new BrowserQueue(gov);
    q.tryAcquireForSession("s1");
    expect(() => q.tryAcquireForSession("s1")).toThrow(SessionBusyError);
    q.release();
    q.tryAcquireForSession("s1");
    q.release();
  });

  it("throws WorkerThrottledError when governor is in warning or reject", () => {
    const gov = new FakeResourceGovernor();
    const q = new BrowserQueue(gov);
    gov.setState("warning");
    expect(() => q.tryAcquireForSession("s1")).toThrow(WorkerThrottledError);
    gov.setState("normal");
    q.tryAcquireForSession("s1");
    q.release();
    gov.setState("reject");
    expect(() => q.tryAcquireForSession("s2")).toThrow(WorkerThrottledError);
  });
});

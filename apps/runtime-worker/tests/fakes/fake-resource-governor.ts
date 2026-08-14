import type {
  GovernorState,
  IResourceGovernor
} from "../../src/core/governor/resource-governor.interface.js";

export class FakeResourceGovernor implements IResourceGovernor {
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

  /** Test helper — mutates governor state and notifies subscribers. */
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

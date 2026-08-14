/**
 * @file Global resource governor seam — queues depend on this interface only (ARCHITECTURE §9).
 */
export type GovernorState = "normal" | "warning" | "reject";

export interface IResourceGovernor {
  readonly state: GovernorState;
  /** Registers a listener; returns dispose to unsubscribe (tests / graceful teardown). */
  onStateChange(callback: (state: GovernorState) => void): () => void;
  stop(): void;
}

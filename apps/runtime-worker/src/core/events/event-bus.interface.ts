/**
 * @file Worker → MCP push channel seam (ARCHITECTURE §10).
 */
export interface SequencedPushEvent {
  readonly seq: number;
  /** JSON-serialisable payload; must include an `event` string discriminator. */
  readonly payload: Record<string, unknown>;
}

export interface IEventBus {
  /** Persists to the ring buffer, fans out to live subscribers, returns assigned monotonic seq. */
  publish(payload: Record<string, unknown>): number;
  /** Live fan-out; returns unsubscribe. */
  subscribe(handler: (event: SequencedPushEvent) => void): () => void;
  /** Buffered events with `seq` strictly greater than `sinceSeq`, oldest-first. */
  getBuffered(sinceSeq: number): SequencedPushEvent[];
  /** Next seq that will be assigned by {@link publish} (1-based). */
  getNextSeq(): number;
  /** Lowest seq currently retained in the buffer, if any. */
  getOldestBufferedSeq(): number | undefined;
}

/**
 * @file In-memory seq + ring buffer for GET /events replay (IMPLEMENTATION-PLAN §4 `core/events`).
 *
 * Sequence numbers are wall-clock offsets from construction time (not an unbounded
 * incrementing counter), with a per-publish bump so bursts in the same millisecond
 * stay strictly monotonic.
 */
import type { IEventBus, SequencedPushEvent } from "./event-bus.interface.js";

export class EventBus implements IEventBus {
  private readonly epochMs = Date.now();
  private lastSeq = 0;
  private readonly buffer: SequencedPushEvent[] = [];
  private readonly subscribers = new Set<(event: SequencedPushEvent) => void>();

  constructor(private readonly maxBufferSize: number) {}

  publish(payload: Record<string, unknown>): number {
    const offset = Date.now() - this.epochMs;
    const seq = Math.max(this.lastSeq + 1, offset > 0 ? offset : 1);
    this.lastSeq = seq;
    const entry: SequencedPushEvent = { seq, payload };
    this.buffer.push(entry);
    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
    for (const handler of this.subscribers) {
      handler(entry);
    }
    return seq;
  }

  subscribe(handler: (event: SequencedPushEvent) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  getBuffered(sinceSeq: number): SequencedPushEvent[] {
    return this.buffer.filter((e) => e.seq > sinceSeq);
  }

  getNextSeq(): number {
    return this.lastSeq + 1;
  }

  getOldestBufferedSeq(): number | undefined {
    return this.buffer[0]?.seq;
  }
}

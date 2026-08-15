import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  // EventBus derives seq from Date.now() - epochMs (see event-bus.ts doc comment), so tests
  // that assert exact seq values need a frozen clock. Without this, elapsed wall-clock time
  // between construction and the first publish() call under CI load pushes seq above 1,
  // failing assertions like `expect(s1).toBe(1)` nondeterministically.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("assigns monotonic sequence numbers", () => {
    const bus = new EventBus(10);
    expect(bus.getNextSeq()).toBe(1);
    const s1 = bus.publish({ event: "worker_health", governor_state: "normal" });
    expect(s1).toBe(1);
    const s2 = bus.publish({ event: "worker_health", governor_state: "warning" });
    expect(s2).toBe(2);
    expect(bus.getNextSeq()).toBe(3);
  });

  it("evicts oldest entries when the ring buffer is full", () => {
    const bus = new EventBus(2);
    bus.publish({ event: "a", n: 1 });
    bus.publish({ event: "a", n: 2 });
    bus.publish({ event: "a", n: 3 });
    expect(bus.getOldestBufferedSeq()).toBe(2);
    const replay = bus.getBuffered(0);
    expect(replay.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("getBuffered returns events strictly after sinceSeq", () => {
    const bus = new EventBus(50);
    bus.publish({ event: "x" });
    bus.publish({ event: "y" });
    expect(bus.getBuffered(1)).toHaveLength(1);
    expect(bus.getBuffered(1)[0]?.payload.event).toBe("y");
  });

  it("assigns strictly increasing seq when many events share the same millisecond", () => {
    const bus = new EventBus(50);
    const seqs: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      seqs.push(bus.publish({ event: "burst", i }));
    }
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    }
  });
});

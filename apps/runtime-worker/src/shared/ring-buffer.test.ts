import { describe, expect, it } from "vitest";

import { RingBuffer } from "./ring-buffer.js";

describe("RingBuffer", () => {
  it("evicts oldest entries when over capacity", () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.snapshot()).toEqual([2, 3]);
  });
});

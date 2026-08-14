import type { Locator, Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { dragLocatorTo } from "./drag-locator.js";

function fakeLocator(box: { x: number; y: number; width: number; height: number } | null, dragTo = vi.fn()) {
  return {
    boundingBox: vi.fn().mockResolvedValue(box),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    dragTo
  } as unknown as Locator;
}

describe("dragLocatorTo", () => {
  it("uses native dragTo when strategy is native", async () => {
    const dragTo = vi.fn().mockResolvedValue(undefined);
    const source = fakeLocator({ x: 0, y: 0, width: 10, height: 10 }, dragTo);
    const target = fakeLocator({ x: 20, y: 20, width: 10, height: 10 });
    const page = {} as unknown as Page;

    await dragLocatorTo(page, source, target, { strategy: "native", timeoutMs: 5_000 });

    expect(dragTo).toHaveBeenCalledWith(target, { timeout: 5_000 });
  });

  it("uses manual mouse sequence by default", async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    const down = vi.fn().mockResolvedValue(undefined);
    const up = vi.fn().mockResolvedValue(undefined);
    const source = fakeLocator({ x: 0, y: 0, width: 20, height: 20 });
    const target = fakeLocator({ x: 100, y: 100, width: 20, height: 20 });
    const page = { mouse: { move, down, up } } as unknown as Page;

    await dragLocatorTo(page, source, target, { timeoutMs: 5_000, steps: 5 });

    expect(move).toHaveBeenNthCalledWith(1, 10, 10);
    expect(down).toHaveBeenCalledOnce();
    expect(move).toHaveBeenNthCalledWith(2, 110, 110, { steps: 5 });
    expect(up).toHaveBeenCalledOnce();
  });

  it("throws when bounding boxes are missing", async () => {
    const source = fakeLocator(null);
    const target = fakeLocator({ x: 0, y: 0, width: 10, height: 10 });
    const page = { mouse: { move: vi.fn(), down: vi.fn(), up: vi.fn() } } as unknown as Page;

    await expect(dragLocatorTo(page, source, target, { timeoutMs: 1_000 })).rejects.toThrow(
      "not visible"
    );
  });
});

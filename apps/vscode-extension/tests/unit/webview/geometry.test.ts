import { describe, expect, it, vi, afterEach } from "vitest";

import { computePopperPosition } from "../../../src/webview/lib/geometry";

describe("computePopperPosition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flips to bottom when there is not enough space above the trigger", () => {
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);

    const trigger = {
      top: 12,
      bottom: 28,
      left: 200,
      right: 214,
      width: 14,
      height: 16
    } as DOMRect;

    const result = computePopperPosition(trigger, 280, 120, "top");

    expect(result.placement).toBe("bottom");
    expect(result.top).toBeGreaterThanOrEqual(trigger.bottom);
    expect(result.top + 120).toBeLessThanOrEqual(600 - 8);
  });

  it("keeps top placement when there is room above the trigger", () => {
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);

    const trigger = {
      top: 180,
      bottom: 196,
      left: 200,
      right: 214,
      width: 14,
      height: 16
    } as DOMRect;

    const result = computePopperPosition(trigger, 280, 120, "top");

    expect(result.placement).toBe("top");
    expect(result.top + 120).toBeLessThanOrEqual(trigger.top);
  });
});

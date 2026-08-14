import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import { screenshotWithoutOverlay } from "./recording-screenshot.js";

describe("screenshotWithoutOverlay", () => {
  it("uses refcounted hide, double paint wait, screenshot, then restore", async () => {
    const calls: string[] = [];
    const evaluate = vi.fn((fn: () => unknown) => {
      if (fn.toString().includes("__vindicateBeginScreenshotHide")) {
        calls.push("begin");
      } else if (fn.toString().includes("__vindicateEndScreenshotHide")) {
        calls.push("end");
      } else {
        calls.push("paint");
      }
      return Promise.resolve();
    });
    const screenshot = vi.fn(() => Promise.resolve(Buffer.from("png")));
    const page = { evaluate, screenshot } as unknown as Page;

    await screenshotWithoutOverlay(page, { type: "png" });

    expect(calls.filter((c) => c === "begin")).toHaveLength(1);
    expect(calls.filter((c) => c === "paint").length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((c) => c === "end")).toHaveLength(1);
    expect(screenshot).toHaveBeenCalledOnce();
  });
});

import type { Page } from "playwright-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../snapshot/settle-detector.js", () => ({
  runSettle: vi.fn().mockResolvedValue({ timedOut: false })
}));

import { runSettle } from "../snapshot/settle-detector.js";
import {
  waitForFinalScreenshotSettle,
  waitForStepScreenshotSettle
} from "./recording-screenshot.js";

const CFG = { VINDICATE_SETTLE_NETWORK_MS: 5000, VINDICATE_SETTLE_TIMEOUT_MS: 10_000 };
const page = { evaluate: vi.fn().mockResolvedValue(undefined) } as unknown as Page;

describe("waitForStepScreenshotSettle", () => {
  beforeEach(() => {
    vi.mocked(runSettle).mockClear();
  });

  it("uses light paint settle for click and fill", async () => {
    await waitForStepScreenshotSettle(page, "click", CFG);
    await waitForStepScreenshotSettle(page, "fill", CFG);
    expect(runSettle).not.toHaveBeenCalled();
  });

  it("runs full settle for navigate and snapshot", async () => {
    await waitForStepScreenshotSettle(page, "navigate", CFG);
    await waitForStepScreenshotSettle(page, "snapshot", CFG);
    expect(runSettle).toHaveBeenCalledTimes(2);
  });

  it("uses light paint settle for select, press_key, dblclick, drag, and upload_file", async () => {
    await waitForStepScreenshotSettle(page, "select", CFG);
    await waitForStepScreenshotSettle(page, "press_key", CFG);
    await waitForStepScreenshotSettle(page, "dblclick", CFG);
    await waitForStepScreenshotSettle(page, "drag", CFG);
    await waitForStepScreenshotSettle(page, "upload_file", CFG);
    expect(runSettle).not.toHaveBeenCalled();
  });
});

describe("waitForFinalScreenshotSettle", () => {
  it("always runs settle", async () => {
    await waitForFinalScreenshotSettle(page, CFG);
    expect(runSettle).toHaveBeenCalledWith(page, CFG);
  });
});

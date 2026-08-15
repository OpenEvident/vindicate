import type { Page } from "playwright-core";

import { runSettle, type SettleConfigSlice } from "../snapshot/settle-detector.js";

/** Actions that capture a step screenshot after async UI may settle. */
export const SCREENSHOT_STEP_ACTIONS = new Set([
  "click",
  "fill",
  "navigate",
  "select",
  "press_key",
  "snapshot",
  "dblclick",
  "drag",
  "upload_file"
]);

/** Actions that wait for network idle before capturing a step screenshot. */
export const FULL_SETTLE_SCREENSHOT_ACTIONS = new Set(["navigate", "snapshot"]);

/** Hide the in-page recorder indicator, capture, then restore visibility. */
export async function waitForPaint(page: Page): Promise<void> {
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        })
    )
    .catch(() => {});
}

export async function screenshotWithoutOverlay(
  page: Page,
  opts: Parameters<Page["screenshot"]>[0]
): Promise<Buffer> {
  await page
    .evaluate(() => {
      const w = window as Window & {
        __vindicateBeginScreenshotHide?: () => void;
      };
      w.__vindicateBeginScreenshotHide?.();
    })
    .catch(() => {});
  await waitForPaint(page);
  try {
    return await page.screenshot(opts);
  } finally {
    await waitForPaint(page);
    await page
      .evaluate(() => {
        const w = window as Window & {
          __vindicateEndScreenshotHide?: () => void;
        };
        w.__vindicateEndScreenshotHide?.();
      })
      .catch(() => {});
  }
}

/** Wait for network/UI settle before step screenshots on load-bearing actions. */
export async function waitForStepScreenshotSettle(
  page: Page,
  action: string,
  cfg: SettleConfigSlice
): Promise<void> {
  if (!SCREENSHOT_STEP_ACTIONS.has(action)) {
    return;
  }
  if (FULL_SETTLE_SCREENSHOT_ACTIONS.has(action)) {
    await runSettle(page, cfg);
    return;
  }
  await waitForPaint(page);
}

/** Final capture uses the same settle path as mutating browser actions. */
export async function waitForFinalScreenshotSettle(
  page: Page,
  cfg: SettleConfigSlice
): Promise<void> {
  await runSettle(page, cfg);
}

/** Shared drag implementation for live handlers and recording playback. */
import type { Locator, Page } from "playwright-core";

export interface DragLocatorOptions {
  readonly strategy?: "manual" | "native";
  readonly steps?: number;
  readonly timeoutMs: number;
}

export async function dragLocatorTo(
  page: Page,
  source: Locator,
  target: Locator,
  opts: DragLocatorOptions
): Promise<void> {
  const strategy = opts.strategy ?? "manual";
  const timeout = opts.timeoutMs;

  if (strategy === "native") {
    await source.dragTo(target, { timeout });
    return;
  }

  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const srcBox = await source.boundingBox();
  const dstBox = await target.boundingBox();
  if (srcBox === null || dstBox === null) {
    throw new Error("drag: source or target element is not visible");
  }

  const srcCenter = {
    x: srcBox.x + srcBox.width / 2,
    y: srcBox.y + srcBox.height / 2
  };
  const dstCenter = {
    x: dstBox.x + dstBox.width / 2,
    y: dstBox.y + dstBox.height / 2
  };
  const steps = opts.steps ?? 10;

  await page.mouse.move(srcCenter.x, srcCenter.y);
  await page.mouse.down();
  await page.mouse.move(dstCenter.x, dstCenter.y, { steps });
  await page.mouse.up();
}

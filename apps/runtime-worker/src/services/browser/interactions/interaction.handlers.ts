/** Playwright-backed interaction handlers for navigate, click, type, select, scroll, and upload. */
import type { Locator, Page } from "playwright-core";

import { NavigationFailedError } from "../../../shared/errors/worker.errors.js";
import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import { runSettle, type SettleConfigSlice } from "../snapshot/settle-detector.js";
import { formatNavigationFailure } from "./navigation-error.js";
import type {
  CheckStep,
  ClickStep,
  DblclickStep,
  DragStep,
  FillStep,
  HoverStep,
  NavigateStep,
  PressKeyStep,
  ScrollByStep,
  SelectOptionStep,
  TypeStep,
  UncheckStep,
  ScreenshotStep,
  UploadFileStep,
  WaitForLoadStateStep,
  WaitForResponseStep
} from "./interaction.params.js";
import { dragLocatorTo } from "./drag-locator.js";
import { resolveWorkerSamplePath } from "./sample-fixtures.js";
import { resolveRef } from "./ref-resolver.js";

export interface HandlerContext {
  readonly actionTimeoutMs: number;
  readonly getDescriptor: (ref: string) => ElementDescriptor | undefined;
}

const SCROLL_DELTA: Record<ScrollByStep["direction"], { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

export async function handleNavigate(
  page: Page,
  step: NavigateStep,
  timeoutMs: number,
  settleCfg: SettleConfigSlice
): Promise<{ ok: true }> {
  const explicitWaitFor = step.wait_for;
  const waitUntil = explicitWaitFor ?? "load";
  try {
    await page.goto(step.url, { waitUntil, timeout: timeoutMs });
  } catch (err: unknown) {
    const { message, status } = formatNavigationFailure(err);
    throw status !== undefined
      ? new NavigationFailedError(message, status)
      : new NavigationFailedError(message);
  }
  // Only for our own default (never for an explicit wait_for): best-effort extra wait for
  // network-idle, same budget as the post-action settle, and never fatal. Real sites routinely never
  // reach true network-idle (chat widgets, analytics beacons, websockets) — requiring it as the hard
  // `goto` condition previously failed navigation outright (and with it, session creation) on pages
  // that had already visibly finished loading, after burning the full action timeout waiting for it.
  if (explicitWaitFor === undefined) {
    await runSettle(page, settleCfg);
  }
  return { ok: true as const };
}

export async function handleClick(
  page: Page,
  step: ClickStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  const button = step.button ?? "left";
  const clickCount = step.click_count ?? 1;
  await locator.click({ button, clickCount, timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

/**
 * Some UI-kit inputs (e.g. Ionic's `<ion-input>`) render the real editable `<input>`/`<textarea>`
 * inside a shadow root and never forward author attributes (like `data-testid`) onto it — so the
 * captured locator resolves to the non-editable host, and `.fill()`/`.pressSequentially()` fail with
 * Playwright's "not an input/textarea/contenteditable" error even though the field visibly works by
 * hand. Drill into the host's single native descendant when the host itself isn't fillable; ambiguous
 * (0 or 2+ candidates) is left untouched so the caller sees Playwright's real error instead of a
 * silent wrong-field fill. Playwright's CSS engine pierces open shadow roots by default, so `.locator()`
 * here reaches a shadow-rendered descendant the same way it would a light-DOM one.
 */
async function resolveFillTarget(locator: Locator, timeoutMs: number): Promise<Locator> {
  const nativelyFillable = await locator.evaluate(
    (el) => {
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
    },
    undefined,
    { timeout: timeoutMs }
  );
  if (nativelyFillable) {
    return locator;
  }
  const inner = locator.locator("input, textarea, [contenteditable]");
  const innerCount = await inner.count();
  return innerCount === 1 ? inner.first() : locator;
}

export async function handleType(
  page: Page,
  step: TypeStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  const target = await resolveFillTarget(locator, ctx.actionTimeoutMs);
  if (step.clear_first === true) {
    await target.clear({ timeout: ctx.actionTimeoutMs });
  }
  await target.pressSequentially(step.value, { timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

/**
 * Best-effort read-back of what actually landed in the field after `fill()`, used only to decide
 * whether to warn — never to fail the action. `.inputValue()` throws on elements that aren't
 * input/textarea/select (e.g. contenteditable), so fall back to trimmed text content; any failure here
 * is swallowed (undefined means "couldn't verify", not "empty").
 */
async function readBackValue(target: Locator, timeoutMs: number): Promise<string | undefined> {
  try {
    return await target.inputValue({ timeout: timeoutMs });
  } catch {
    try {
      return (await target.textContent({ timeout: timeoutMs })) ?? undefined;
    } catch {
      return undefined;
    }
  }
}

export async function handleFill(
  page: Page,
  step: FillStep,
  ctx: HandlerContext
): Promise<{ ok: true; hint?: string }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  const target = await resolveFillTarget(locator, ctx.actionTimeoutMs);
  await target.fill(step.value, { timeout: ctx.actionTimeoutMs });
  // fill() sets the DOM value directly rather than dispatching real key events — some controlled-input
  // components (state driven off onKeyDown/onInput, not the native value setter) silently discard that
  // and re-render empty. Confirmed live (GrubCenter product name field): fill() reports success, but a
  // later read shows "". A read-back that comes back non-empty is never flagged here — this only
  // catches the field snapping back to fully empty, so it stays silent on ordinary reformatting (phone
  // number masks, etc.).
  if (step.value.length > 0) {
    const actual = await readBackValue(target, ctx.actionTimeoutMs);
    if (actual !== undefined && actual.length === 0) {
      return {
        ok: true as const,
        hint:
          "fill() reported success but the field reads back empty — this component likely ignores the " +
          "programmatic value set and needs real key events instead. Retry with action:'type' (same ref/value)."
      };
    }
  }
  return { ok: true as const };
}

export async function handleDblclick(
  page: Page,
  step: DblclickStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  await locator.dblclick({ timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

export async function handleDrag(
  page: Page,
  step: DragStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const source = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  const target = await resolveRef(page, step.to_ref, ctx.getDescriptor(step.to_ref));
  await dragLocatorTo(page, source, target, {
    ...(step.strategy !== undefined ? { strategy: step.strategy } : {}),
    ...(step.steps !== undefined ? { steps: step.steps } : {}),
    timeoutMs: ctx.actionTimeoutMs
  });
  return { ok: true as const };
}

export async function handleSelectOption(
  page: Page,
  step: SelectOptionStep,
  ctx: HandlerContext
): Promise<{ ok: true; selected: string[] }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  // selectOption() resolves to the option *values* actually selected — real, useful confirmation of
  // what stuck (particularly for label/index selection, where the caller doesn't already know the
  // underlying value). Playwright already refuses to resolve until a matching option exists, so this
  // isn't a correctness check the way the fill-empty-readback hint is; it's the caller-facing echo of
  // an outcome Playwright already computed and, until now, this handler discarded.
  let selected: string[];
  if ("value" in step) {
    selected = await locator.selectOption({ value: step.value }, { timeout: ctx.actionTimeoutMs });
  } else if ("label" in step) {
    selected = await locator.selectOption({ label: step.label }, { timeout: ctx.actionTimeoutMs });
  } else {
    selected = await locator.selectOption({ index: step.index }, { timeout: ctx.actionTimeoutMs });
  }
  return { ok: true as const, selected };
}

export async function handleHover(
  page: Page,
  step: HoverStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  await locator.hover({ timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

export async function handleCheck(
  page: Page,
  step: CheckStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  await locator.check({ timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

export async function handleUncheck(
  page: Page,
  step: UncheckStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  await locator.uncheck({ timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

export async function handlePressKey(
  page: Page,
  step: PressKeyStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  if (step.ref !== undefined) {
    const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
    await locator.press(step.key, { timeout: ctx.actionTimeoutMs });
  } else {
    await page.keyboard.press(step.key);
  }
  return { ok: true as const };
}

export async function handleScrollBy(
  page: Page,
  step: ScrollByStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const delta = SCROLL_DELTA[step.direction];
  const dx = delta.x * step.amount_px;
  const dy = delta.y * step.amount_px;
  if (step.ref !== undefined) {
    const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
    await locator.evaluate(
      (el, { scrollX, scrollY }) => {
        el.scrollBy(scrollX, scrollY);
      },
      { scrollX: dx, scrollY: dy }
    );
  } else {
    await page.evaluate(
      ({ scrollX, scrollY }) => {
        window.scrollBy(scrollX, scrollY);
      },
      { scrollX: dx, scrollY: dy }
    );
  }
  return { ok: true as const };
}

export async function handleUploadFile(
  page: Page,
  step: UploadFileStep,
  ctx: HandlerContext
): Promise<{ ok: true }> {
  const locator = await resolveRef(page, step.ref, ctx.getDescriptor(step.ref));
  const filePaths =
    step.sample !== undefined ? [resolveWorkerSamplePath(step.sample)] : (step.files ?? []);
  await locator.setInputFiles(filePaths, { timeout: ctx.actionTimeoutMs });
  return { ok: true as const };
}

function describeScreenshotScope(scope: ScreenshotStep["scope"], fullPage: boolean): string {
  if (scope !== undefined) {
    if ("ref" in scope) {
      return `ref:${scope.ref}`;
    }
    return `css:${scope.css}`;
  }
  return fullPage ? "full_page" : "viewport";
}

export async function handleScreenshot(
  page: Page,
  step: ScreenshotStep,
  ctx: HandlerContext
): Promise<{
  image_base64: string;
  mime: "image/jpeg";
  url: string;
  title: string;
  scope_applied: string;
}> {
  const quality = step.quality ?? 70;
  const fullPage = step.full_page ?? false;
  const scopeApplied = describeScreenshotScope(step.scope, fullPage);

  let buf: Buffer;
  if (step.scope !== undefined) {
    if ("ref" in step.scope) {
      const locator = await resolveRef(page, step.scope.ref, ctx.getDescriptor(step.scope.ref));
      buf = await locator.screenshot({ type: "jpeg", quality });
    } else {
      buf = await page.locator(step.scope.css).screenshot({ type: "jpeg", quality });
    }
  } else {
    buf = await page.screenshot({ type: "jpeg", quality, fullPage });
  }

  return {
    image_base64: buf.toString("base64"),
    mime: "image/jpeg",
    url: page.url(),
    title: await page.title(),
    scope_applied: scopeApplied
  };
}

export async function handleWaitForLoadState(
  page: Page,
  step: WaitForLoadStateStep,
  timeoutMs: number
): Promise<{ ok: true }> {
  const state = step.state ?? "load";
  await page.waitForLoadState(state, { timeout: timeoutMs });
  return { ok: true as const };
}

export async function handleWaitForResponse(
  page: Page,
  step: WaitForResponseStep,
  timeoutMs: number
): Promise<{ ok: true; status: number; url: string }> {
  const timeout = step.timeout_ms ?? timeoutMs;
  const response = await page.waitForResponse((r) => r.url().includes(step.url_pattern), {
    timeout
  });
  return { ok: true as const, status: response.status(), url: response.url() };
}

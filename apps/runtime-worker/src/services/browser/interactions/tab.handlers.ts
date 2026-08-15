import type { BrowserContext, Page } from "playwright-core";

import { ValidationError } from "../../../shared/errors/worker.errors.js";
import type { CloseTabStep, HandleDialogStep, NewTabStep, SwitchTabStep } from "./tab.params.js";

export interface TabSessionState {
  activePageIndex: number;
}

export function openPages(context: BrowserContext): Page[] {
  return context.pages().filter((p) => !p.isClosed());
}

function resolvePage(context: BrowserContext, state: TabSessionState, index?: number): Page {
  const pages = openPages(context);
  if (pages.length === 0) {
    throw new ValidationError("No open browser tabs");
  }
  const idx = index ?? state.activePageIndex;
  if (idx < 0 || idx >= pages.length) {
    throw new ValidationError(`Tab index ${idx} is out of range (0-${pages.length - 1})`);
  }
  state.activePageIndex = idx;
  return pages[idx]!;
}

export async function handleNewTab(
  context: BrowserContext,
  state: TabSessionState,
  step: NewTabStep,
  timeoutMs: number
): Promise<{ tabIndex: number; url: string }> {
  const page = await context.newPage();
  if (step.url !== undefined) {
    await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  }
  const pages = openPages(context);
  const tabIndex = pages.indexOf(page);
  state.activePageIndex = tabIndex >= 0 ? tabIndex : pages.length - 1;
  await page.bringToFront();
  return { tabIndex: state.activePageIndex, url: page.url() };
}

export async function handleSwitchTab(
  context: BrowserContext,
  state: TabSessionState,
  step: SwitchTabStep
): Promise<{ title: string; url: string }> {
  const page = resolvePage(context, state, step.index);
  await page.bringToFront();
  state.activePageIndex = step.index;
  return { title: await page.title(), url: page.url() };
}

/** Bounds how long switch_tab_by_url waits for a matching tab — see handleSwitchTabByUrl. Empirically,
 * a real site-opened popup's bounce-to-final-URL redirect chain (Klarna's payment popup, observed
 * against the actual staging environment) can take up to ~15s — 8s was too tight and produced spurious
 * failures on a popup that was genuinely on its way, just not there yet. */
const SWITCH_TAB_BY_URL_MAX_WAIT_MS = 15_000;
const SWITCH_TAB_BY_URL_POLL_MS = 250;

/**
 * A site-opened popup (payment/login/OAuth) is a real, expected case here — not just a tab the agent
 * itself opened via `new_tab`. Such popups routinely start on an intermediate redirect/bounce URL before
 * reaching the one the agent actually asked to match (confirmed against a real Klarna checkout: the
 * popup opens on `.../loading.html`, then redirects to `login...klarna.com/...` a few seconds later) — a
 * single instantaneous check would fail on a popup that is genuinely there but just not finished
 * navigating yet. This polls for up to `SWITCH_TAB_BY_URL_MAX_WAIT_MS`, the same bounded-wait idiom
 * `handleHandleDialog` already uses for "wait for a state to arrive," not a blanket action retry.
 */
export async function handleSwitchTabByUrl(
  context: BrowserContext,
  state: TabSessionState,
  urlPattern: string,
  maxWaitMs: number = SWITCH_TAB_BY_URL_MAX_WAIT_MS,
  pollMs: number = SWITCH_TAB_BY_URL_POLL_MS
): Promise<{ title: string; url: string }> {
  const deadline = Date.now() + maxWaitMs;
  let pages = openPages(context);
  let match = pages.find((p) => p.url().includes(urlPattern));
  while (match === undefined && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    pages = openPages(context);
    match = pages.find((p) => p.url().includes(urlPattern));
  }
  if (match === undefined) {
    throw new ValidationError(
      `No open tab matches '${urlPattern}' after waiting ${maxWaitMs}ms — if a site action was expected to ` +
        `open one (a payment/login button, an OAuth flow), check browser_read's "other tab(s) open" banner for ` +
        `the tab's real current URL and retry with that; if you intended to open a new tab yourself, use ` +
        `browser_navigate(new_tab:true) instead.`
    );
  }
  const index = pages.indexOf(match);
  state.activePageIndex = index;
  await match.bringToFront();
  return { title: await match.title(), url: match.url() };
}

export async function handleCloseTab(
  context: BrowserContext,
  state: TabSessionState,
  step: CloseTabStep
): Promise<{ closed: true }> {
  const pages = openPages(context);
  if (pages.length === 0) {
    throw new ValidationError("No open browser tabs to close");
  }
  const index = step.index ?? state.activePageIndex;
  const page = resolvePage(context, state, index);
  await page.close();
  const remaining = openPages(context);
  if (remaining.length === 0) {
    state.activePageIndex = 0;
  } else {
    state.activePageIndex = Math.min(state.activePageIndex, remaining.length - 1);
  }
  return { closed: true as const };
}

export async function handleHandleDialog(
  context: BrowserContext,
  state: TabSessionState,
  step: HandleDialogStep,
  timeoutMs: number
): Promise<{ handled: true; type: "alert" | "confirm" | "prompt" }> {
  const page = resolvePage(context, state);
  const dialog = await page
    .waitForEvent("dialog", { timeout: Math.min(timeoutMs, 5_000) })
    .catch(() => null);
  if (dialog === null) {
    const client = await context.newCDPSession(page);
    await client.send("Page.handleJavaScriptDialog", {
      accept: step.dialog_action === "accept",
      promptText: step.prompt_text ?? ""
    });
    return { handled: true as const, type: "alert" };
  }
  const type = dialog.type() as "alert" | "confirm" | "prompt";
  if (step.dialog_action === "accept") {
    await dialog.accept(step.prompt_text);
  } else {
    await dialog.dismiss();
  }
  return { handled: true as const, type };
}

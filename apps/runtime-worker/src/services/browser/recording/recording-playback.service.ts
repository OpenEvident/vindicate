import type { BrowserContext, Page } from "playwright-core";

import type { RecordedStep } from "@vindicate/protocol";
import type { SelectorCandidatePayload } from "./recording.types.js";
import { dragLocatorTo } from "../interactions/drag-locator.js";
import { resolveFrameScope } from "../interactions/frame-scope.js";
import {
  handleCloseTab,
  handleNewTab,
  handleSwitchTab,
  handleSwitchTabByUrl,
  openPages,
  type TabSessionState
} from "../interactions/tab.handlers.js";
import { runSettle } from "../snapshot/settle-detector.js";
import type { SettleConfigSlice } from "../snapshot/settle-detector.js";

export interface PlaybackResult {
  ok: boolean;
  error?: string;
  failedStep?: number;
  action?: string;
}

type Role = Parameters<Page["getByRole"]>[0];

function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const segs = s.split('"');
  return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
}

function parseRoleName(value: string): { role: string; name: string } {
  const match = /^(.+)\[name="(.*)"\]$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Invalid role/name candidate: ${value}`);
  }
  return { role: match[1], name: match[2] };
}

/**
 * Narrows a recorded `SelectorCandidate` (the protocol's zod-inferred shape, whose optional fields are
 * `T | undefined`) down to `SelectorCandidatePayload` (`exactOptionalPropertyTypes`-compatible — optional
 * keys must be entirely absent, never present-with-`undefined`). Every field the candidate can carry is
 * forwarded here, once, so `resolveCandidateLocator`'s strategies (`scoped`'s `container`, iframe-scoped
 * strategies' `frame_path`) all see the full recorded candidate, not a hand-picked subset.
 */
function toCandidatePayload(candidate: {
  strategy: string;
  value: string;
  attr?: string | undefined;
  strength?: "strong" | "medium" | "weak" | undefined;
  container?: { role: string; name: string } | undefined;
  frame_path?: SelectorCandidatePayload["frame_path"];
}): SelectorCandidatePayload {
  return {
    strategy: candidate.strategy,
    value: candidate.value,
    ...(candidate.attr !== undefined ? { attr: candidate.attr } : {}),
    ...(candidate.strength !== undefined ? { strength: candidate.strength } : {}),
    ...(candidate.container !== undefined ? { container: candidate.container } : {}),
    ...(candidate.frame_path !== undefined ? { frame_path: candidate.frame_path } : {})
  };
}

function resolveCandidateLocator(page: Page, candidate: SelectorCandidatePayload) {
  // Narrows to a FrameLocator first when the candidate was captured inside a nested iframe (human
  // recording via computeFramePathForFrame, or an agent recording forwarding browser_act's own
  // frame_path) — every strategy below renders unchanged either way, same as the live ref-resolver.
  const scope = resolveFrameScope(page, candidate.frame_path, (strategy) => {
    throw new Error(`unrenderable frame_path hop (${strategy}) for recorded candidate`);
  });
  switch (candidate.strategy) {
    case "testid":
      return scope.locator(
        `xpath=//*[@${candidate.attr ?? "data-testid"}=${xpathLiteral(candidate.value)}]`
      );
    case "testid_xpath":
    case "attr_combo":
    case "sibling_text":
    case "nth":
    case "xpath": // legacy recordings
      return scope.locator(`xpath=${candidate.value}`);
    case "dom_id":
      return scope.locator(
        candidate.value.startsWith("//")
          ? `xpath=${candidate.value}`
          : `xpath=//*[@id=${xpathLiteral(candidate.value)}]`
      );
    case "role_name": {
      const { role, name } = parseRoleName(candidate.value);
      return scope.getByRole(role as Role, { name, exact: true });
    }
    case "label":
      return scope.getByLabel(candidate.value, { exact: true });
    case "placeholder":
      return scope.getByPlaceholder(candidate.value, { exact: true });
    case "text":
      return scope.getByText(candidate.value, { exact: true });
    case "scoped": {
      const { role, name } = parseRoleName(candidate.value);
      if (candidate.container === undefined) {
        throw new Error("scoped candidate missing container");
      }
      return scope
        .getByRole(candidate.container.role as Role, { name: candidate.container.name })
        .getByRole(role as Role, { name, exact: true });
    }
    case "role+name": {
      // legacy recordings
      const { role, name } = parseRoleName(candidate.value);
      return scope.getByRole(role as Role, { name });
    }
    case "css": // legacy recordings
      return scope.locator(candidate.value);
    default:
      throw new Error(`Unsupported candidate strategy: ${candidate.strategy}`);
  }
}

/**
 * Executes one recorded step against `currentPage` and returns the page subsequent steps should run
 * against — unchanged for every ordinary action, but reassigned by `new_tab`/`switch_tab`/
 * `switch_tab_by_url`/`close_tab`, which call the exact same tab.handlers.ts functions the live agent
 * uses (so a recorded popup switch replays with the same URL-substring matching + bounded poll
 * `switch_tab_by_url` already relies on live).
 */
async function executeRecordedStep(
  currentPage: Page,
  context: BrowserContext,
  tabState: TabSessionState,
  step: RecordedStep,
  timeoutMs: number
): Promise<Page> {
  const page = currentPage;
  switch (step.action) {
    case "navigate": {
      if (step.url === undefined) {
        throw new Error("navigate step missing url");
      }
      // `load`, not `networkidle`, as the hard condition: real sites routinely never go truly network-
      // idle (chat widgets, analytics, websockets), and requiring it here previously failed replay
      // outright on a page that had already visibly finished loading. The best-effort network-idle
      // wait below (SETTLE_ACTIONS includes "navigate") gives it a chance to settle further anyway.
      await page.goto(step.url, { waitUntil: "load", timeout: timeoutMs });
      return page;
    }
    case "snapshot":
      return page;
    case "new_tab": {
      await handleNewTab(
        context,
        tabState,
        { action: "new_tab", ...(step.url !== undefined ? { url: step.url } : {}) },
        timeoutMs
      );
      return openPages(context)[tabState.activePageIndex] ?? page;
    }
    case "switch_tab": {
      if (step.index === undefined) {
        throw new Error("switch_tab step missing index");
      }
      await handleSwitchTab(context, tabState, { action: "switch_tab", index: step.index });
      return openPages(context)[tabState.activePageIndex] ?? page;
    }
    case "switch_tab_by_url": {
      if (step.url === undefined) {
        throw new Error("switch_tab_by_url step missing url");
      }
      await handleSwitchTabByUrl(context, tabState, step.url);
      return openPages(context)[tabState.activePageIndex] ?? page;
    }
    case "close_tab": {
      await handleCloseTab(context, tabState, {
        action: "close_tab",
        ...(step.index !== undefined ? { index: step.index } : {})
      });
      return openPages(context)[tabState.activePageIndex] ?? page;
    }
    case "click":
    case "fill":
    case "select":
    case "check":
    case "uncheck":
    case "press_key":
    case "scroll":
    case "hover":
    case "dblclick":
    case "upload_file": {
      const chosen = step.chosen ?? step.candidates?.[0];
      if (chosen === undefined || chosen === null) {
        throw new Error(`${step.action} step missing locator`);
      }
      const locator = resolveCandidateLocator(page, toCandidatePayload(chosen));
      switch (step.action) {
        case "click":
          await locator.click({ timeout: timeoutMs });
          return page;
        case "fill":
          if (step.text === undefined) {
            throw new Error("fill step missing text");
          }
          await locator.fill(step.text, { timeout: timeoutMs });
          return page;
        case "select":
          if (step.text === undefined) {
            throw new Error("select step missing text");
          }
          await locator.selectOption(step.text, { timeout: timeoutMs });
          return page;
        case "check":
          await locator.check({ timeout: timeoutMs });
          return page;
        case "uncheck":
          await locator.uncheck({ timeout: timeoutMs });
          return page;
        case "press_key":
          if (step.key === undefined) {
            throw new Error("press_key step missing key");
          }
          await page.keyboard.press(step.key);
          return page;
        case "scroll":
          await page.mouse.wheel(0, 300);
          return page;
        case "hover":
          await locator.hover({ timeout: timeoutMs });
          return page;
        case "dblclick":
          await locator.dblclick({ timeout: timeoutMs });
          return page;
        case "upload_file":
          throw new Error("upload_file playback is not supported");
      }
      return page;
    }
    case "drag": {
      const sourceChosen = step.chosen ?? step.candidates?.[0];
      const targetChosen = step.target?.chosen ?? step.target?.candidates?.[0];
      if (
        sourceChosen === undefined ||
        sourceChosen === null ||
        targetChosen === undefined ||
        targetChosen === null
      ) {
        throw new Error("drag step missing source or target locator");
      }
      const source = resolveCandidateLocator(page, toCandidatePayload(sourceChosen));
      const target = resolveCandidateLocator(page, toCandidatePayload(targetChosen));
      await dragLocatorTo(page, source, target, { timeoutMs });
      return page;
    }
    default:
      throw new Error(`Unsupported recorded action: ${step.action as string}`);
  }
}

const SETTLE_ACTIONS = new Set([
  "click",
  "fill",
  "select",
  "check",
  "uncheck",
  "press_key",
  "scroll",
  "hover",
  "dblclick",
  "drag",
  "new_tab",
  "switch_tab",
  "switch_tab_by_url",
  "close_tab",
  "navigate"
]);

/**
 * Tab actions already do their own bounded wait internally (`handleSwitchTabByUrl` polls for up to 15s —
 * see tab.handlers.ts) before ever throwing. Retrying the whole call again on top of that is redundant,
 * not additive: a genuinely-failing tab switch would otherwise take ~3x its own internal wait to report
 * failure. These get a single attempt; every other action keeps the existing 3-attempt/500ms-backoff
 * retry, which is a reasonable hedge against a not-yet-settled element with no internal wait of its own.
 */
const NO_OUTER_RETRY_ACTIONS = new Set(["new_tab", "switch_tab", "switch_tab_by_url", "close_tab"]);
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 500;

/**
 * Whether a step from a dependency artifact should be executed during precondition replay.
 * The browser session is already on the target page before playback runs — skip page-setup
 * steps (entry navigate, implicit navigates, snapshots) rather than full test replay.
 */
function shouldSkipPlaybackStep(step: RecordedStep, index: number): boolean {
  if (step.action === "snapshot") {
    return true;
  }
  if (step.action !== "navigate") {
    return false;
  }
  if (step.navigation_trigger === "implicit") {
    return true;
  }
  // Precondition replay starts from the current session page; skip artifact entry navigate.
  if (
    index === 0 &&
    (step.navigation_trigger === "explicit" || step.navigation_trigger === undefined)
  ) {
    return true;
  }
  return false;
}

export async function playbackRecordingSteps(
  page: Page,
  steps: RecordedStep[],
  settleCfg: SettleConfigSlice,
  actionTimeoutMs: number
): Promise<PlaybackResult> {
  const context = page.context();
  const tabState: TabSessionState = {
    activePageIndex: Math.max(0, openPages(context).indexOf(page))
  };
  // Reassigned by new_tab/switch_tab/switch_tab_by_url/close_tab steps — every action after a recorded
  // tab switch (e.g. filling a card field inside a payment popup) must run against the page the
  // recording was actually attributed to at that point, not the page playback started on.
  let currentPage = page;

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    if (shouldSkipPlaybackStep(step, index)) {
      continue;
    }

    const maxAttempts = NO_OUTER_RETRY_ACTIONS.has(step.action) ? 1 : MAX_ATTEMPTS;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        currentPage = await executeRecordedStep(
          currentPage,
          context,
          tabState,
          step,
          actionTimeoutMs
        );
        if (SETTLE_ACTIONS.has(step.action)) {
          await runSettle(currentPage, settleCfg);
        }
        lastError = undefined;
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
        }
      }
    }

    if (lastError !== undefined) {
      return {
        ok: false,
        error: lastError.message,
        failedStep: step.seq,
        action: step.action
      };
    }
  }

  return { ok: true };
}

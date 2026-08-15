/**
 * @file Discovers and captures interactive elements inside `<iframe>` content — same-origin or
 * cross-origin, since every primitive used here (`Frame.evaluate`, `frameLocator()`,
 * `ElementHandle.contentFrame()`, `Page.ariaSnapshot()`) is CDP-driven and bypasses the JS-level
 * same-origin policy a raw `iframe.contentDocument` access would hit.
 *
 * Discovery uses `ariaSnapshot({ mode: "ai" })`, which — verified empirically against a real,
 * 25-frame-deep payment-checkout page (Klarna + nested Stripe Express Checkout) — only descends into
 * iframes that actually render meaningful accessibility-tree content, silently skipping the many
 * zero-size/off-screen tracking and metrics iframes real third-party widgets litter a page with. A
 * naive `boundingBox()` visibility check does **not** reliably reproduce this (tested: it wrongly
 * flags 1px-tall beacon iframes and off-screen hCaptcha widgets as "visible"), so this deliberately
 * leans on Playwright's own accessibility computation rather than reinventing it.
 *
 * The `[ref=e2]` identifiers `ariaSnapshot` returns, and the `aria-ref=` locator engine used to
 * resolve them, are internal to Playwright and undocumented in its public types — but scoped entirely
 * to this single capture pass (never persisted, never returned to callers), exactly like this
 * codebase's own ephemeral `ref-xxxxxxxx` scheme already works. Every *persisted* locator this module
 * produces (the `frame_path` entries and the elements' own locators) comes from
 * `captureInteractiveSnapshot`/`deriveIframeHostLocator`, the same portable, testid/role/xpath-tiered
 * derivation used everywhere else — `aria-ref=` is discovery plumbing only, never a stored result.
 */
import type { StructuredLocator } from "@vindicate/protocol";
import type { ElementHandle, Frame, Page } from "playwright-core";

import { renderFrameHopSelector } from "../interactions/frame-scope.js";
import {
  captureInteractiveSnapshot,
  type InteractiveCaptureOpts
} from "./interactive-capture.evaluate.js";
import { deriveIframeHostLocator } from "./iframe-host-locator.evaluate.js";
import type { InteractiveElementWire } from "./snapshot.types.js";

/** Bounds worst-case capture cost on iframe-heavy pages (ad slots, tracking pixels, nested widgets). */
const MAX_FRAME_DEPTH = 3;
const MAX_FRAMES_TO_PROCESS = 12;
const ARIA_SNAPSHOT_TIMEOUT_MS = 5_000;

/** Bounded wait for a freshly-injected iframe to leave `about:blank` before its content is captured.
 * A real, live-verified race: a payment widget (e.g. Klarna/Stripe) injects its iframe host on a
 * "Continue" click, and the frame starts life on `about:blank` for a beat before navigating to its
 * real content — capturing it during that window finds nothing, and the caller (an agent reading the
 * page right after the action's settle) sees a blank iframe and no target selectors. A no-op for the
 * overwhelming common case (`frame.url()` already real) — this only pays the wait when the frame is
 * genuinely still on `about:blank` at capture time. */
const FRAME_READY_TIMEOUT_MS = 3_000;

async function waitForFrameToLeaveBlank(frame: Frame): Promise<void> {
  if (frame.url() !== "about:blank") {
    return;
  }
  await frame
    .waitForURL((url) => url.href !== "about:blank", { timeout: FRAME_READY_TIMEOUT_MS })
    .catch(() => {});
}

/** Matches an `ariaSnapshot({mode:'ai'})` iframe node that has nested content (the trailing `:`) —
 * an iframe listed without one carries no meaningful accessibility content and is not descended into.
 * `(?: \[[^\]]*\])*` skips zero or more other bracket annotations Playwright may insert between the
 * role and `[ref=…]` — confirmed against a real capture: an iframe holding DOM focus (e.g. right after
 * a widget auto-focuses a field inside it, as Klarna's checkout does on every "Continue" click) renders
 * as `iframe [active] [ref=e24]:`, not `iframe [ref=e24]:`. Missing that case meant the *outer* iframe
 * silently dropped out of discovery the moment anything inside it gained focus — while its nested
 * children (never carrying `[active]` themselves) kept matching — which looked exactly like "the main
 * form vanished but the express-payment buttons stayed" in `browser_read` output. */
const MEANINGFUL_IFRAME_RE = /iframe(?: \[[^\]]*\])* \[ref=(\S+?)\]:/g;

export function extractMeaningfulIframeRefs(snapshotText: string): string[] {
  return [...snapshotText.matchAll(MEANINGFUL_IFRAME_RE)].map((m) => m[1]!);
}

/** Shared FNV-1a core for every post-capture ref rehash below — always produces the same
 * `ref-[0-9a-f]{8}` shape every consumer (`browser_act`'s `RefSchema`, `normalize-worker-step.ts`)
 * requires, whatever salt is used to derive it. */
function fnv1aRef(salt: string): string {
  let h = 2166136261;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  }
  return `ref-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** FNV-1a over the ref plus its frame_path, so elements that happen to hash identically to a same-
 * shaped element in a sibling frame (or the top frame) never collide — same digest algorithm
 * `captureInteractiveSnapshot` itself uses, just salted with frame identity. */
export function rehashRefForFrame(
  originalRef: string,
  framePath: readonly StructuredLocator[]
): string {
  return fnv1aRef(`${originalRef}|${JSON.stringify(framePath)}`);
}

/**
 * Disambiguates elements that still share an identical `ref` after capture — e.g. two structurally
 * identical repeating controls (delivery-option buttons, etc.) whose accessible names weren't
 * distinguishing enough for `stableRefFor`'s hash, and that don't sit inside a recognized
 * repeating-row container for the existing `container`-scoping fallback to apply. Cross-frame
 * collisions are already excluded by `rehashRefForFrame`'s salting — this catches the remaining case:
 * two distinct elements in the *same* document producing the same ref.
 *
 * Without this, a ref collision silently overwrites one element's descriptor-map entry with the
 * other's (last write wins), so a later `browser_act` on that ref can resolve to the WRONG element
 * with no error — the exact "unclear which element was captured" failure mode this closes.
 *
 * The first occurrence of a ref keeps it unchanged — zero behavior change for the overwhelming common
 * case of no collision. Every later occurrence is rehashed, salted with its position among the
 * duplicates, into a new, still valid `ref-[0-9a-f]{8}` ref.
 */
export function disambiguateDuplicateRefs(
  elements: readonly InteractiveElementWire[]
): InteractiveElementWire[] {
  const seen = new Map<string, number>();
  return elements.map((el) => {
    const occurrence = (seen.get(el.ref) ?? 0) + 1;
    seen.set(el.ref, occurrence);
    return occurrence === 1 ? el : { ...el, ref: fnv1aRef(`${el.ref}|dup${occurrence}`) };
  });
}

export function withFramePath(
  el: InteractiveElementWire,
  framePath: readonly StructuredLocator[]
): InteractiveElementWire {
  return {
    ...el,
    ref: rehashRefForFrame(el.ref, framePath),
    ...(el.locator !== undefined ? { locator: { ...el.locator, frame_path: framePath } } : {})
  };
}

interface FrameQueueEntry {
  readonly scope: Page | Frame;
  readonly framePath: readonly StructuredLocator[];
  readonly depth: number;
}

/**
 * Breadth-first: every iframe at the current depth is discovered and has its own content captured
 * before any of them is descended into. Depth-first would let one deeply-nested branch (a real page
 * observed: Express Checkout → Stripe → Google Pay, three levels just for one button) exhaust the
 * frame budget before ever reaching a *sibling* iframe at the same level — e.g. the actual card-input
 * fields sitting next to an express-payment cluster. Breadth-first spends the budget on breadth first,
 * so sibling content is never starved by one branch's depth.
 */
async function captureFramesBreadthFirst(
  page: Page,
  evalOpts: InteractiveCaptureOpts
): Promise<InteractiveElementWire[]> {
  const projectTestidAttr = evalOpts.testidCandidates[0] ?? "data-testid";
  const results: InteractiveElementWire[] = [];
  let queue: FrameQueueEntry[] = [{ scope: page, framePath: [], depth: 0 }];
  let remaining = MAX_FRAMES_TO_PROCESS;

  while (queue.length > 0 && remaining > 0) {
    const nextWave: FrameQueueEntry[] = [];

    for (const entry of queue) {
      if (remaining <= 0) break;
      if (entry.depth >= MAX_FRAME_DEPTH) continue;

      let bodySnap: string;
      try {
        bodySnap = await entry.scope
          .locator("body")
          .ariaSnapshot({ mode: "ai", timeout: ARIA_SNAPSHOT_TIMEOUT_MS });
      } catch {
        // Best-effort discovery — a frame mid-navigation or a body that never settles must never fail
        // the overall browser_read; the caller already has the (unaffected) top-level snapshot.
        continue;
      }

      for (const ref of extractMeaningfulIframeRefs(bodySnap)) {
        if (remaining <= 0) break;
        remaining--;

        let handle: ElementHandle | null;
        try {
          handle = await entry.scope
            .locator(`aria-ref=${ref}`)
            .elementHandle({ timeout: ARIA_SNAPSHOT_TIMEOUT_MS });
        } catch {
          continue;
        }
        if (handle === null) continue;

        // Chrome's accessibility tree flattens across frame boundaries in a way the DOM doesn't —
        // confirmed live (Klarna+Stripe checkout): a top-level `ariaSnapshot({mode:'ai'})` call can
        // resolve an `aria-ref` to an iframe that doesn't actually live in the document being
        // searched, but two levels deeper inside a *nested* iframe's own document. Trusting that
        // reference here computes a wrong (too-shallow) frame_path for it and, since the *correct*
        // nested discovery pass finds the very same element again later, captures the identical real
        // element twice under two different refs — one of them pointing at a `frame_path` that was
        // never valid. Verifying the resolved handle actually belongs to the scope we searched closes
        // that gap: a genuinely separate element (a real duplicate widget) always belongs wherever
        // it's found, so this never filters out a true duplicate — only a rediscovery of the same node.
        const expectedFrame = entry.scope === page ? page.mainFrame() : entry.scope;
        let ownerFrame: Frame | null;
        try {
          ownerFrame = await handle.ownerFrame();
        } catch {
          continue;
        }
        if (ownerFrame === null || ownerFrame !== expectedFrame) {
          continue;
        }

        let hostLocator: StructuredLocator;
        let childFrame: Frame | null;
        try {
          [hostLocator, childFrame] = await Promise.all([
            handle.evaluate(deriveIframeHostLocator, {
              testidCandidates: evalOpts.testidCandidates,
              projectTestidAttr
            }),
            handle.contentFrame()
          ]);
        } catch {
          continue;
        }
        if (childFrame === null) continue;

        await waitForFrameToLeaveBlank(childFrame);

        const framePath = [...entry.framePath, hostLocator];

        try {
          const levelResult = await childFrame.evaluate(captureInteractiveSnapshot, evalOpts);
          for (const el of levelResult.elements) {
            results.push(withFramePath(el, framePath));
          }
        } catch {
          // Frame navigated away or its document tore down mid-capture — skip its content, not the read.
          continue;
        }

        nextWave.push({ scope: childFrame, framePath, depth: entry.depth + 1 });
      }
    }

    queue = nextWave;
  }

  return results;
}

/**
 * Captures interactive elements inside every meaningful iframe reachable from `page`, up to
 * `MAX_FRAME_DEPTH` levels and `MAX_FRAMES_TO_PROCESS` frames total, breadth-first. Returns an empty
 * array — cheaply, with no `ariaSnapshot` call at all — for the overwhelming majority of pages that
 * have no iframes, so this adds no latency to a normal `browser_read`. Never throws: any failure
 * degrades to "found nothing extra," identical to the page having no capturable iframe content.
 */
export async function captureChildFrames(
  page: Page,
  evalOpts: InteractiveCaptureOpts
): Promise<InteractiveElementWire[]> {
  if (page.frames().length <= 1) {
    return [];
  }
  try {
    return await captureFramesBreadthFirst(page, evalOpts);
  } catch {
    return [];
  }
}

/**
 * Given a `Frame` an event fired in (e.g. the frame `context.exposeBinding`'s `source.frame` reports
 * for a recorded click), climbs `frame.parentFrame()` up to the page's main frame and derives a
 * `StructuredLocator` for each ancestor `<iframe>` host element along the way — the same
 * `deriveIframeHostLocator` tiered derivation `captureFramesBreadthFirst` uses when discovering frames
 * top-down, just walked bottom-up here since recording starts from "which frame did this happen in?"
 * rather than "what iframes does this page contain?". Returns `[]` (outermost-first, empty for the
 * overwhelming common case of a non-iframe event) for the top frame with zero extra Playwright calls.
 * Best-effort like `captureChildFrames`: a mid-navigation ancestor must never drop the recorded event
 * itself, so any failure partway through returns whatever hops were resolved so far.
 */
export async function computeFramePathForFrame(
  frame: Frame,
  opts: { readonly testidCandidates: string[] }
): Promise<StructuredLocator[]> {
  const projectTestidAttr = opts.testidCandidates[0] ?? "data-testid";

  const ancestors: Frame[] = [];
  let cur: Frame | null = frame;
  while (cur !== null) {
    const parent: Frame | null = cur.parentFrame();
    if (parent === null) {
      break;
    }
    ancestors.push(cur);
    cur = parent;
  }
  ancestors.reverse(); // outermost first

  const framePath: StructuredLocator[] = [];
  for (const hopFrame of ancestors) {
    try {
      const handle = await hopFrame.frameElement();
      const hostLocator = await handle.evaluate(deriveIframeHostLocator, {
        testidCandidates: opts.testidCandidates,
        projectTestidAttr
      });
      framePath.push(hostLocator);
    } catch {
      break;
    }
  }
  return framePath;
}

/**
 * Resolves a `frame_path` (an element's iframe ancestor chain, outermost first — the shape
 * `computeFramePathForFrame`/`withFramePath` produce) down to the actual `Frame` whose document that
 * element lives in. The down-resolution mirror of `computeFramePathForFrame`'s up-walk.
 *
 * Needed for scoped `browser_read`: a ref captured inside an iframe (e.g. a folded dialog's own
 * summary row) carries a descriptor whose `locator.frame_path` says which frame it's in, but a scoped
 * capture must actually *run* inside that frame's own document via `Frame.evaluate()` — `Page.evaluate()`
 * only ever sees the top document and can never find it, which is why scoping into an iframe-nested ref
 * previously failed with "ref not found" even though the ref itself was a valid, freshly-captured one.
 *
 * Never throws — any hop that can't be located, or whose content frame isn't attached (a mid-navigation
 * ancestor, a torn-down widget), resolves to `null` so the caller can raise its own clear error instead
 * of silently falling back to a top-page capture that would just reproduce the same "not found" failure.
 */
export async function resolveFrameForPath(
  page: Page,
  framePath: readonly StructuredLocator[]
): Promise<Frame | null> {
  if (framePath.length === 0) {
    return null;
  }
  let scope: Page | Frame = page;
  for (const hop of framePath) {
    let selector: string;
    try {
      selector = renderFrameHopSelector(hop, (strategy) => {
        throw new Error(`unrenderable frame_path hop (${strategy})`);
      });
    } catch {
      return null;
    }
    let handle: ElementHandle | null;
    try {
      handle = await scope.locator(selector).elementHandle();
    } catch {
      return null;
    }
    if (handle === null) {
      return null;
    }
    const child = await handle.contentFrame();
    if (child === null) {
      return null;
    }
    scope = child;
  }
  return scope as Frame;
}

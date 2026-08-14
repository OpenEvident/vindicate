/** Orchestrates interactive snapshots, delta overlay, descriptor map, and persistence hooks. */
import type { StructuredLocator } from "@vindicate/protocol";
import type { Frame, Page } from "playwright-core";

import { ValidationError } from "../../../shared/errors/worker.errors.js";
import { computeDelta, computeSupersedes, type ChangeDetail, type RefSnapshotForDelta } from "./delta-computer.js";
import type { ElementDescriptor } from "./element-descriptor.js";
import { captureChildFrames, disambiguateDuplicateRefs, resolveFrameForPath, withFramePath } from "./frame-capture.js";
import { captureInteractiveSnapshot, type InteractiveCaptureOpts } from "./interactive-capture.evaluate.js";
import type { SnapshotMemoryTable } from "./snapshot-memory.js";
import type { SnapshotParams } from "./snapshot.params.js";
import type { ChangeDetailWire, InteractiveElementWire, OtherTabsWire, SnapshotResultWire } from "./snapshot.types.js";

/** Caps the URL list surfaced in the banner — `count` still reflects the true total either way. */
const OTHER_TABS_URL_CAP = 5;

/** Other open tabs/windows besides `page` itself (a site-opened popup — payment, login, OAuth — lands
 * here exactly like one the agent opened deliberately). Best-effort: `page.context()` can throw if the
 * page is mid-teardown, and that must never fail the snapshot it's merely annotating. */
function computeOtherTabs(page: Page): OtherTabsWire | undefined {
  try {
    const others = page
      .context()
      .pages()
      .filter((p) => p !== page && !p.isClosed());
    if (others.length === 0) {
      return undefined;
    }
    return { count: others.length, urls: others.slice(0, OTHER_TABS_URL_CAP).map((p) => p.url()) };
  } catch {
    return undefined;
  }
}

export interface SnapshotEngineConfigSlice {
  readonly VINDICATE_SNAPSHOT_MAX_NODES: number;
  readonly VINDICATE_SNAPSHOT_MAX_HTML_BYTES: number;
  readonly VINDICATE_MAX_OUTPUT_CHARS: number;
  readonly VINDICATE_SNAPSHOT_DESCRIPTOR_CAP: number;
  readonly VINDICATE_READ_SETTLE_MS: number;
}

function buildRefMap(elements: readonly InteractiveElementWire[]): Record<string, RefSnapshotForDelta> {
  const m: Record<string, RefSnapshotForDelta> = {};
  for (const e of elements) {
    const row: RefSnapshotForDelta = {
      name: e.name,
      ...(e.value !== undefined ? { value: e.value } : {}),
      ...(e.disabled !== undefined ? { disabled: e.disabled } : {}),
      ...(e.aria_invalid !== undefined ? { aria_invalid: e.aria_invalid } : {}),
      ...(e.aria_busy !== undefined ? { aria_busy: e.aria_busy } : {}),
      ...(e.aria_expanded !== undefined ? { aria_expanded: e.aria_expanded } : {}),
      ...(e.aria_checked !== undefined ? { aria_checked: e.aria_checked } : {}),
      ...(e.aria_selected !== undefined ? { aria_selected: e.aria_selected } : {}),
      ...(e.aria_required !== undefined ? { aria_required: e.aria_required } : {}),
      ...(e.aria_pressed !== undefined ? { aria_pressed: e.aria_pressed } : {}),
      ...(e.aria_haspopup !== undefined ? { aria_haspopup: e.aria_haspopup } : {})
    };
    m[e.ref] = row;
  }
  return m;
}

function toChangeWire(changed: readonly ChangeDetail[]): ChangeDetailWire[] {
  return changed.map((c) => ({
    ref: c.ref,
    changes: c.changes.map((x) => ({
      field: x.field,
      before: x.before,
      after: x.after
    }))
  }));
}

export const DEFAULT_TESTID_CANDIDATES = [
  "data-testid",
  "data-cy",
  "data-test",
  "data-e2e",
  "e2e",
  "data-test-id",
  "data-qa",
  "data-automation-id",
  "data-automation",
  "data-tid"
] as const;

export function buildTestidCandidates(preferred?: string): string[] {
  if (preferred === undefined) return [...DEFAULT_TESTID_CANDIDATES];
  return [preferred, ...DEFAULT_TESTID_CANDIDATES.filter((c) => c !== preferred)];
}

/**
 * Wait until the DOM stops adding/removing nodes for a short window (or `capMs` elapses), so a read
 * taken right after an action captures async-rendered content (autocomplete lists, portals) instead
 * of racing it. Bounded and best-effort — never blocks the snapshot. Not network-idle (which never
 * settles on chatty sites). `attributes` is intentionally not observed so CSS animations can't defeat it.
 */
async function quietWindowSettle(page: Page, capMs: number): Promise<void> {
  try {
    await page.evaluate(
      (cap) =>
        new Promise<void>((resolve) => {
          const QUIET_MS = 150;
          let quietTimer = setTimeout(finish, QUIET_MS);
          const deadline = setTimeout(finish, cap);
          const observer = new MutationObserver(() => {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(finish, QUIET_MS);
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
          function finish(): void {
            clearTimeout(quietTimer);
            clearTimeout(deadline);
            observer.disconnect();
            resolve();
          }
        }),
      capMs
    );
  } catch {
    /* best-effort — a failed settle must never block the snapshot */
  }
}

export class SnapshotEngine {
  private readonly sessionOptions = new Map<string, { testidCandidates: string[] }>();
  private readonly refDescriptors = new Map<string, Map<string, ElementDescriptor>>();

  constructor(
    private readonly memory: SnapshotMemoryTable,
    private readonly cfg: SnapshotEngineConfigSlice,
    private readonly onSnapshotCommitted: (sessionId: string, snapshotId: number) => void
  ) {}

  setSessionOptions(sessionId: string, opts: { testidCandidates: string[] }): void {
    this.sessionOptions.set(sessionId, opts);
  }

  onNavigation(sessionId: string): void {
    this.memory.onNavigation(sessionId);
  }

  dropSession(sessionId: string): void {
    this.memory.dropSession(sessionId);
    this.sessionOptions.delete(sessionId);
    this.refDescriptors.delete(sessionId);
  }

  getAllDescriptors(sessionId: string): Map<string, ElementDescriptor> {
    return this.refDescriptors.get(sessionId) ?? new Map<string, ElementDescriptor>();
  }

  async takeSnapshot(sessionId: string, page: Page, params: SnapshotParams): Promise<SnapshotResultWire> {
    const testidCandidates = this.sessionOptions.get(sessionId)?.testidCandidates ?? [...DEFAULT_TESTID_CANDIDATES];
    const maxNodes = params.max_nodes ?? this.cfg.VINDICATE_SNAPSHOT_MAX_NODES;
    const collapse = params.collapse !== false;
    const viewportOnly = params.viewport_only === true;
    const scopeRef = params.scope !== undefined && "ref" in params.scope ? params.scope.ref : undefined;
    const scopeCss = params.scope !== undefined && "css" in params.scope ? params.scope.css : undefined;
    let scopeDescriptor: InteractiveCaptureOpts["scopeDescriptor"];
    let scopeFramePath: readonly StructuredLocator[] | undefined;
    const url = page.url();
    if (scopeRef !== undefined) {
      const desc = this.refDescriptors.get(sessionId)?.get(scopeRef);
      if (desc === undefined) {
        throw new ValidationError(`snapshot scope ref '${scopeRef}' not found — take a fresh snapshot first`);
      }
      if (desc.snapshotUrl !== url) {
        throw new ValidationError(
          `snapshot scope ref '${scopeRef}' is from a previous page (was ${desc.snapshotUrl}, now ${url}) — take a fresh snapshot first`
        );
      }
      scopeDescriptor = {
        ...(desc.testid !== undefined ? { testid: desc.testid } : {}),
        testidAttr: desc.testidAttr,
        ...(desc.domId !== undefined ? { domId: desc.domId } : {}),
        tag: desc.tag,
        ...(desc.type !== undefined ? { type: desc.type } : {}),
        ...(desc.placeholder !== undefined ? { placeholder: desc.placeholder } : {}),
        ...(desc.role.length > 0 ? { role: desc.role } : {}),
        ...(desc.name.length > 0 ? { name: desc.name } : {})
      };
      scopeFramePath = desc.locator?.frame_path;
    }

    // A scoped ref captured inside an iframe must be captured *in that frame's own document* —
    // page.evaluate() only ever sees the top document and would report "ref not found" for an element
    // that genuinely exists, just not there (the actual cause of a real production failure: scoping into
    // a folded dialog's own ref, inside a Klarna/Stripe checkout iframe, always failed this way).
    let evalTarget: Page | Frame = page;
    if (scopeFramePath !== undefined && scopeFramePath.length > 0) {
      const frame = await resolveFrameForPath(page, scopeFramePath);
      if (frame === null) {
        throw new ValidationError(
          `snapshot scope ref '${scopeRef}' is inside an iframe that could no longer be located — take a fresh snapshot`
        );
      }
      evalTarget = frame;
    }

    const snapshotId = this.memory.allocateSnapshotId(sessionId);
    const title = await page.title();

    if (params.no_settle !== true && this.cfg.VINDICATE_READ_SETTLE_MS > 0) {
      await quietWindowSettle(page, this.cfg.VINDICATE_READ_SETTLE_MS);
    }

    const evalOpts: InteractiveCaptureOpts = {
      maxNodes,
      testidCandidates,
      collapse,
      viewportOnly,
      includeVerifiable: params.include_verifiable === true,
      ...(scopeDescriptor !== undefined ? { scopeDescriptor } : {}),
      ...(scopeCss !== undefined ? { scopeCss } : {})
    };
    const ir = await evalTarget.evaluate(captureInteractiveSnapshot, evalOpts);
    if (ir.error === "ref_not_found") {
      throw new ValidationError("snapshot scope ref not found — take a fresh snapshot");
    }
    if (ir.error === "css_not_found") {
      throw new ValidationError("snapshot scope css selector matched no element");
    }

    // When the scope itself resolved into an iframe, every captured element's ref/locator must be
    // re-stamped with that same frame_path — otherwise a later browser_act on one of them (e.g. the
    // Confirm button just revealed inside a folded dialog) would resolve against the top page instead of
    // the frame it actually lives in, and fail exactly the same way the original scope lookup did.
    const scopedElements =
      evalTarget !== page ? ir.elements.map((el) => withFramePath(el, scopeFramePath ?? [])) : ir.elements;

    // Iframe content (same-origin or cross-origin) is invisible to the top-level page.evaluate() above —
    // a separate pass. Skipped for scoped reads (scopeRef/scopeCss): a scoped read is a narrow, deliberate
    // request, and discovering *further*-nested iframes under it isn't well-defined, so that stays exactly
    // as it was before this capability existed (zero risk). Best-effort: never throws, never affects the
    // top-level elements/truncation computed above.
    const frameElements =
      scopeRef === undefined && scopeCss === undefined ? await captureChildFrames(page, evalOpts) : [];

    // Two distinct elements can still land on the same ref within one document (a structurally
    // identical repeating control whose accessible name wasn't distinguishing enough, and that isn't
    // inside a recognized repeating-row container for the `container` fallback to apply). Cross-frame
    // collisions are already excluded by `withFramePath`'s salting; this catches same-document ones.
    const elements = disambiguateDuplicateRefs(
      frameElements.length > 0 ? [...scopedElements, ...frameElements] : scopedElements
    );
    const truncated = ir.truncated;
    const collapsedCount = ir.collapsed_count;
    const alerts = ir.alerts.length > 0 ? ir.alerts : undefined;
    const overlayActive = ir.overlay_active;

    // Merge into the per-session descriptor map (do not replace) so refs from earlier reads stay
    // resolvable; re-inserting a re-seen ref refreshes its LRU recency. Cross-page safety comes from
    // the snapshotUrl guard at resolve time, not from clearing here.
    const descMap = this.refDescriptors.get(sessionId) ?? new Map<string, ElementDescriptor>();
    for (const el of elements) {
      const descriptor: ElementDescriptor = {
        ...(el.testid !== undefined ? { testid: el.testid } : {}),
        testidAttr: el.testid_attr ?? testidCandidates[0] ?? "data-testid",
        ...(el.dom_id !== undefined ? { domId: el.dom_id } : {}),
        tag: el.tag,
        ...(el.type !== undefined ? { type: el.type } : {}),
        ...(el.placeholder !== undefined ? { placeholder: el.placeholder } : {}),
        role: el.role,
        name: el.name,
        ...(el.context !== undefined ? { context: el.context } : {}),
        ...(el.container !== undefined ? { container: el.container } : {}),
        ...(el.locator !== undefined ? { locator: el.locator } : {}),
        snapshotUrl: url
      };
      descMap.delete(el.ref);
      descMap.set(el.ref, descriptor);
    }
    while (descMap.size > this.cfg.VINDICATE_SNAPSHOT_DESCRIPTOR_CAP) {
      const oldest = descMap.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      descMap.delete(oldest);
    }
    this.refDescriptors.set(sessionId, descMap);

    const truncationWarning = truncated
      ? `⚠️ Snapshot truncated at ${maxNodes} nodes — use scope (ref or css) to focus on a section`
      : undefined;

    let deltaFallback: boolean | undefined;
    let added: string[] | undefined;
    let removed: string[] | undefined;
    let changed: ChangeDetailWire[] | undefined;

    if (params.delta !== undefined) {
      const since = params.delta.since_snapshot_id;
      const prev = this.memory.getEntry(sessionId, since);
      if (prev === undefined || prev.url !== url) {
        deltaFallback = true;
      } else {
        const curMap = buildRefMap(elements);
        const d = computeDelta(prev.refMap, curMap);
        added = d.added;
        removed = d.removed;
        changed = toChangeWire(d.changed);
      }
    }

    const refMap = buildRefMap(elements);
    this.memory.commit(sessionId, snapshotId, url, refMap);
    this.onSnapshotCommitted(sessionId, snapshotId);

    const otherTabs = computeOtherTabs(page);

    // A newly-added element sharing role+name with an older, still-present one is very likely a live
    // replacement (a third-party SDK swapping one iframe-hosted control for another as page state
    // changes) rather than an unrelated coincidence — see computeSupersedes. Only meaningful once a
    // real delta exists (added !== undefined); a first-ever read has nothing to diff against.
    const supersedes = added !== undefined && added.length > 0 ? computeSupersedes(elements, added) : undefined;
    const elementsForResponse =
      supersedes !== undefined && supersedes.size > 0
        ? elements.map((el) => {
            const supersedesRef = supersedes.get(el.ref);
            return supersedesRef !== undefined ? { ...el, supersedes_ref: supersedesRef } : el;
          })
        : elements;

    return {
      snapshot_id: snapshotId,
      url,
      title,
      truncated,
      node_count: elements.length,
      collapsed_count: collapsedCount,
      testid_attr: testidCandidates[0] ?? "data-testid",
      elements: elementsForResponse,
      ...(added !== undefined ? { added } : {}),
      ...(removed !== undefined ? { removed } : {}),
      ...(changed !== undefined ? { changed } : {}),
      ...(alerts !== undefined ? { alerts } : {}),
      ...(overlayActive !== undefined ? { overlay_active: overlayActive } : {}),
      ...(otherTabs !== undefined ? { other_tabs: otherTabs } : {}),
      ...(truncationWarning !== undefined ? { truncation_warning: truncationWarning } : {}),
      ...(deltaFallback === true ? { delta_fallback: true } : {})
    };
  }

  getDescriptor(sessionId: string, ref: string): ElementDescriptor | undefined {
    return this.refDescriptors.get(sessionId)?.get(ref);
  }
}

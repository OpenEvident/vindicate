/** Wire types for snapshot results returned to MCP and command steps. */
import type { StructuredLocator } from "@vindicate/protocol";

export interface ChangeDetailWire {
  readonly ref: string;
  readonly changes: ReadonlyArray<{
    readonly field: string;
    readonly before: string;
    readonly after: string;
  }>;
}

export interface InteractiveElementWire {
  readonly ref: string;
  readonly tag: string;
  readonly role: string;
  readonly name: string;
  readonly testid?: string;
  readonly testid_attr?: string;
  readonly dom_id?: string;
  readonly type?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /**
   * Set only when `false` (visible is the common case, so this stays absent then) — computed CSS
   * visibility (`display`/`visibility`/`opacity`, walking ancestors), distinct from `in_viewport`
   * (viewport-bounds geometry only). Exists to tell apart two structurally-identical candidates for
   * the same role/name at different `frame_path` depths — e.g. a payment SDK's pre-mounted-but-hidden
   * iframe alongside the real, user-facing one once a payment method is actually selected. Live-only:
   * never persisted into `StructuredLocator`, a codegen schema, or a recording — visibility at capture
   * time is transient and would be stale by replay time.
   */
  readonly visible?: false;
  /**
   * Set when this element's ref is brand new this read (via `computeSupersedes`) AND an older
   * element with the same role+name (different `frame_path`, e.g.) was already present — the ref of
   * that older element. Signals "this one just replaced that one" for a third-party SDK swapping one
   * iframe-hosted control for another as page state changes (e.g. a payment provider remounting its
   * card-input iframe once a payment method is selected) — the two are indistinguishable by any
   * static signal; only the delta (this one is new, that one isn't) tells them apart. Only ever set
   * from the second read in a session onward (needs a prior snapshot to diff against).
   */
  readonly supersedes_ref?: string;
  readonly in_viewport: boolean;
  readonly collapsed_siblings?: number;
  /** This row is the summary of a collapsed open-overlay subtree (its item count is in `collapsed_siblings`). */
  readonly overlay?: boolean;
  /** Set only when this ref collides with a sibling: the uniquely-named repeating row to scope resolution to. */
  readonly container?: { readonly role: string; readonly name: string };
  readonly context?: string;
  /** The verified, render-agnostic locator derived for this element at capture (§ structured locator). */
  readonly locator?: StructuredLocator;
  /**
   * Set when this element itself can't reliably receive a click directly — computed `pointer-events: none`
   * (can never receive one), or collapsed to an explicit ~1x1px box (the sr-only visually-hidden-input
   * pattern; technically receives one but a real click essentially never lands on the exact pixel) — and
   * `locator` was derived from the real click-delegate ancestor instead. `click` works, `check`/`uncheck`
   * do not (the delegate isn't itself a checkbox/radio).
   */
  readonly click_delegate?: boolean;
  readonly aria_invalid?: boolean | null;
  readonly aria_busy?: boolean | null;
  readonly aria_expanded?: boolean | null;
  readonly aria_checked?: boolean | "mixed" | null;
  readonly aria_selected?: boolean | null;
  readonly aria_required?: boolean | null;
  readonly aria_pressed?: boolean | "mixed" | null;
  readonly aria_haspopup?: boolean | null;
}

/**
 * The topmost open overlay (modal dialog, non-modal dialog, listbox, menu, popover) currently rendered.
 * Surfaced independently of the overlay flood-collapse so even a *small* blocking popup (e.g. a 1–2
 * control sign-in promo) is announced — `modal: true` means it intercepts clicks on the page behind it.
 */
export interface OverlayActiveWire {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly modal: boolean;
}

/**
 * Other browser tabs/windows open in this session besides the one just captured — a same-origin
 * `window.open()` or a real cross-origin popup (payment/login/OAuth: Klarna, PayPal, Google login, ...)
 * both land here as a completely separate top-level page, invisible to a normal snapshot of the
 * *current* page. Surfaced proactively (same reasoning as `overlay_active`): a page that just clicked
 * "Pay" and opened a login popup looks, from that page's own snapshot alone, exactly like nothing
 * happened — without this, the agent has no signal at all that something needs `browser_navigate
 * switch_to_url` before it can continue. `urls` is capped; `count` always reflects the true total.
 */
export interface OtherTabsWire {
  readonly count: number;
  readonly urls: string[];
}

export interface SnapshotResultWire {
  readonly snapshot_id: number;
  readonly url: string;
  readonly title: string;
  readonly elements?: InteractiveElementWire[];
  readonly added?: string[];
  readonly removed?: string[];
  readonly changed?: ChangeDetailWire[];
  readonly alerts?: string[];
  /** Topmost open overlay, when one is rendered (see OverlayActiveWire). */
  readonly overlay_active?: OverlayActiveWire;
  /** Other open tabs/windows besides this one, when any exist (see OtherTabsWire). */
  readonly other_tabs?: OtherTabsWire;
  readonly truncated: boolean;
  readonly truncation_warning?: string;
  readonly node_count: number;
  readonly collapsed_count: number;
  readonly testid_attr: string;
  readonly delta_fallback?: boolean;
}

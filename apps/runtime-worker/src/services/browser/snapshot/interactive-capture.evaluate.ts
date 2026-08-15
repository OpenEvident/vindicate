/**
 * @file Browser-side interactive snapshot capture — passed to `page.evaluate()` only.
 * All helpers must live inside the exported function so Playwright's fn.toString() serialization
 * includes them in the browser context (module-scope functions are not sent).
 */
import type { StructuredLocator } from "@vindicate/protocol";

import type { InteractiveElementWire, OverlayActiveWire } from "./snapshot.types.js";

export interface InteractiveCaptureOpts {
  readonly maxNodes: number;
  readonly testidCandidates: string[];
  readonly collapse: boolean;
  readonly viewportOnly: boolean;
  readonly includeVerifiable: boolean;
  readonly scopeDescriptor?: {
    readonly testid?: string;
    readonly testidAttr: string;
    readonly domId?: string;
    readonly tag: string;
    readonly type?: string;
    readonly placeholder?: string;
    readonly role?: string;
    readonly name?: string;
  };
  readonly scopeCss?: string | undefined;
}

export interface InteractiveCaptureBrowserResult {
  readonly elements: InteractiveElementWire[];
  readonly truncated: boolean;
  readonly collapsed_count: number;
  readonly alerts: string[];
  readonly overlay_active?: OverlayActiveWire;
  readonly error?: "ref_not_found" | "css_not_found";
}

/**
 * Runs in the browser — do not import Node built-ins here.
 */
export function captureInteractiveSnapshot(
  opts: InteractiveCaptureOpts
): InteractiveCaptureBrowserResult {
  /* __VINDICATE_EVAL__:interactive_snapshot__ */

  const GENERATED_ID_RE: ReadonlyArray<RegExp> = [
    /^[a-z]+-[0-9a-f]{6,}$/i,
    /^\d+$/,
    // React's useId() always wraps its token in colons on both ends ("`:r0:`"), optionally behind a
    // library prefix (Radix sets identifierPrefix "radix-", giving "radix-:r0:"). The old pattern
    // `/^:[a-z0-9]+$/` required a leading colon with no trailing one, so it never matched real React
    // ids at all — confirmed live: "radix-:ria:" on a GrubCenter dropdown trigger slipped through as a
    // "stable" dom_id and got used for locator derivation despite being render-order-dependent.
    /^[a-z0-9_]*-?:[a-z0-9]+:$/i
  ];

  function digestRef(s: string): string {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return `ref-${(h >>> 0).toString(16).padStart(8, "0")}`;
  }

  function isGeneratedDomId(id: string): boolean {
    return GENERATED_ID_RE.some((re) => re.test(id));
  }

  function findTestid(el: Element, candidates: string[]): { value: string; attr: string } | null {
    for (const attr of candidates) {
      const val = el.getAttribute(attr);
      if (val !== null && val.length > 0) {
        return { value: val, attr };
      }
    }
    return null;
  }

  function getNearestLandmark(el: Element): string {
    const LANDMARKS = ["dialog", "main", "nav", "aside", "section", "form", "header", "footer"];
    let cur: Element | null = el.parentElement;
    while (cur !== null) {
      const role = cur.getAttribute("role") ?? cur.tagName.toLowerCase();
      if (LANDMARKS.includes(role)) {
        const label = cur.getAttribute("aria-label") ?? cur.getAttribute("aria-labelledby") ?? "";
        return label.length > 0 ? `${role} '${label}'` : role;
      }
      cur = cur.parentElement;
    }
    return "root";
  }

  // `aria-hidden="true"` is the standard, unambiguous signal that a subtree is excluded from the
  // accessibility tree — the same rule every screen reader and Playwright's own accessibility engine
  // follow. SPA routers (Ionic among them) commonly keep a previous page's DOM around, marked
  // aria-hidden, instead of removing it — without this check, capture reports stale, no-longer-visible
  // controls (a cached login form, a previous page's buttons) as if they were part of the current page.
  // Walks through shadow-root boundaries via the host chain so aria-hidden set on a shadow component's
  // host also excludes its shadow-internal content.
  function isAriaHiddenAncestor(el: Element): boolean {
    let cur: Element | null = el;
    while (cur !== null) {
      if (cur.getAttribute("aria-hidden") === "true") {
        return true;
      }
      const parent: Element | null = cur.parentElement;
      if (parent !== null) {
        cur = parent;
      } else {
        const root = cur.getRootNode();
        cur = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return false;
  }

  function captureVerifiable(): Element[] {
    const found: Element[] = [];
    // h1–h6, not just h1: a real dialog title ("Your Cart") is routinely an h2/h3, not the page's one
    // h1 — confirmed live (the cart drawer's own heading was invisible under the h1-only rule even
    // though it was the exact assertion target an agent needed). A page carries at most a handful of
    // headings total, so this stays cheap regardless of page size — unlike the plain-static-text case
    // below, which is deliberately scope-gated instead.
    for (const el of Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
      if ((el.textContent ?? "").trim().length > 0 && !isAriaHiddenAncestor(el)) {
        found.push(el);
      }
    }
    for (const el of Array.from(document.querySelectorAll('[role="alert"],[role="status"]'))) {
      if (!isAriaHiddenAncestor(el)) {
        found.push(el);
      }
    }
    return found;
  }

  const SCOPED_TEXT_SKIP_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "svg",
    "path",
    "img",
    "iframe"
  ]);
  const SCOPED_TEXT_MIN_LEN = 1;
  const SCOPED_TEXT_MAX_LEN = 100;

  // Counts only *leaf* elements (no element children) sharing this exact text within the scope — the
  // same population `captureScopedText` below draws candidates from. A non-leaf wrapper that contains
  // only this one leaf and nothing else (the ordinary "<div><span>Total</span></div>" layout, which also
  // recurses up to <body> the same way) shares the identical full-text value at every level, but is never
  // itself a capture candidate — counting it as a "match" would reject the overwhelming common case of a
  // singly-wrapped leaf for no real benefit. This catches the actual motivating collision instead: two
  // separate, sibling leaves both showing the same line price/amount within one scope. (Not a full
  // getByText-resolution simulation against the whole live page — the existing role-less "text" tier
  // elsewhere in this file does no uniqueness check at all today, so this is a net improvement either way.)
  function countLeafTextMatches(scopeRoot: Element, text: string): number {
    let count = 0;
    const walker = document.createTreeWalker(scopeRoot, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node !== null) {
      const el = node as Element;
      if (el.children.length === 0) {
        const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t === text) {
          count++;
        }
      }
      node = walker.nextNode();
    }
    return count;
  }

  /**
   * Plain, non-interactive text (a cart drawer's item name / Subtotal / Total row, none of which carry
   * any role, id, or data-testid) — confirmed live invisible to every existing capture path (interactive
   * walk only visits focusable/clickable elements; `captureVerifiable` only ever covers headings and
   * alert/status). Deliberately gated to an explicitly-scoped read only (never the top-level/unscoped
   * case) — broadening this globally would grow every `browser_read` response on every page that has any
   * static text at all, the same budget this session already had to fix a truncation problem for. Scoping
   * into a container is already a deliberate "show me everything in here" signal from the agent, so this
   * only activates where that signal exists.
   */
  function captureScopedText(scopeRoot: Element): Element[] {
    const found: Element[] = [];
    const walker = document.createTreeWalker(scopeRoot, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node !== null) {
      const el = node as Element;
      if (
        el !== scopeRoot &&
        el.children.length === 0 &&
        !SCOPED_TEXT_SKIP_TAGS.has(el.tagName.toLowerCase()) &&
        !isAriaHiddenAncestor(el)
      ) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (
          text.length >= SCOPED_TEXT_MIN_LEN &&
          text.length <= SCOPED_TEXT_MAX_LEN &&
          countLeafTextMatches(scopeRoot, text) === 1
        ) {
          found.push(el);
        }
      }
      node = walker.nextNode();
    }
    return found;
  }

  function captureAlerts(): string[] {
    const alerts: string[] = [];
    const selectors = [
      '[role="alert"]',
      '[role="status"]',
      '[role="log"]',
      '[aria-live="polite"]',
      '[aria-live="assertive"]'
    ];
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (isAriaHiddenAncestor(el)) {
          continue;
        }
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length > 0) {
          alerts.push(text);
        }
      }
    }
    return [...new Set(alerts)];
  }

  function domPath(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur !== null && cur.nodeType === Node.ELEMENT_NODE) {
      const node: Element = cur;
      const tag = node.tagName.toLowerCase();
      if (tag === "html") {
        parts.push("html");
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        break;
      }
      const sameTagSiblings = Array.from(parent.children).filter(
        (c): c is Element => c.nodeType === Node.ELEMENT_NODE && c.tagName === node.tagName
      );
      const nth = sameTagSiblings.indexOf(node) + 1;
      parts.push(`${tag}:nth-of-type(${nth})`);
      cur = parent;
    }
    return parts.reverse().join(">");
  }

  function inViewport(el: Element): boolean {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return false;
    }
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  }

  function parseAriaBool(attr: string | null): boolean | "mixed" | null {
    if (attr === null) {
      return null;
    }
    const v = attr.trim().toLowerCase();
    if (v === "" || v === "undefined") {
      return null;
    }
    if (v === "mixed") {
      return "mixed";
    }
    if (v === "true") {
      return true;
    }
    if (v === "false") {
      return false;
    }
    return null;
  }

  function stripMixed(value: boolean | "mixed" | null): boolean | null {
    return value === "mixed" ? null : value;
  }

  function implicitRole(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const explicit = el.getAttribute("role");
    if (explicit !== null && explicit.length > 0) {
      return explicit;
    }
    switch (tag) {
      case "button":
        return "button";
      case "a":
        return el.hasAttribute("href") ? "link" : "generic";
      case "input": {
        const t = (el as HTMLInputElement).type?.toLowerCase() ?? "text";
        if (t === "checkbox") {
          return "checkbox";
        }
        if (t === "radio") {
          return "radio";
        }
        if (t === "range") {
          return "slider";
        }
        if (t === "number") {
          return "spinbutton";
        }
        return "textbox";
      }
      case "textarea":
        return "textbox";
      case "select":
        return "combobox";
      case "option":
        return "option";
      case "summary":
        return "button";
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return "heading";
      default:
        return "generic";
    }
  }

  function isInteractive(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (["button", "a", "input", "select", "textarea", "option", "summary"].includes(tag)) {
      return true;
    }
    const role = el.getAttribute("role");
    if (
      role !== null &&
      [
        "button",
        "link",
        "textbox",
        "checkbox",
        "radio",
        "tab",
        "menuitem",
        "option",
        "combobox",
        "listbox",
        "slider",
        "spinbutton",
        "switch",
        "menuitemcheckbox",
        "menuitemradio"
      ].includes(role)
    ) {
      return true;
    }
    if (el.hasAttribute("onclick")) {
      return true;
    }
    if (el.getAttribute("tabindex") === "0") {
      return true;
    }
    // aria-haspopup marks a popup/menu trigger even when the framework (e.g. Radix's `asChild`
    // pattern) renders it onto a plain <div> with no role — its valid tokens per the ARIA spec are
    // "false" | "true" | "menu" | "listbox" | "tree" | "grid" | "dialog", not a plain boolean, so this
    // reads the raw attribute rather than the true/false-only parseAriaBool used for the wire field.
    const haspopup = el.getAttribute("aria-haspopup");
    if (haspopup !== null) {
      const v = haspopup.trim().toLowerCase();
      if (
        v === "true" ||
        v === "menu" ||
        v === "listbox" ||
        v === "tree" ||
        v === "grid" ||
        v === "dialog"
      ) {
        return true;
      }
    }
    return false;
  }

  // True once `el`'s nearest root is a shadow root rather than the document — i.e. it lives inside an
  // (open) shadow tree. Playwright's XPath engine cannot resolve into a shadow root under any axis, and
  // CSS selectors are forbidden project-wide, so locator derivation must skip the XPath-rendered tiers
  // for these elements and rely only on the semantic getBy* engines, which do pierce shadow roots.
  function isInShadowDom(el: Element): boolean {
    return el.getRootNode() !== document;
  }

  function elementText(el: Element): string {
    let out = "";
    // A <slot> renders its *assigned* (projected, light-DOM) nodes, not its own fallback children —
    // walking childNodes here would miss slotted text entirely (e.g. a shadow-DOM button's visible
    // label, projected in from its host's light-DOM text).
    const children: Node[] =
      el.tagName.toLowerCase() === "slot" &&
      typeof (el as HTMLSlotElement).assignedNodes === "function"
        ? (el as HTMLSlotElement).assignedNodes({ flatten: true })
        : Array.from(el.childNodes);
    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent ?? "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        out += ` ${elementText(node as Element)} `;
      }
    }
    return out;
  }

  function visibleTextSlice(el: Element, max: number): string {
    // Space-join descendant text (ARIA accessible-name spacing) so abutting child elements don't run
    // together ("ColomboColombo District" → "Colombo Colombo District"). No de-duplication.
    const t = elementText(el).replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }

  function getAccessibleName(el: Element, candidates: string[]): string {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy !== null && labelledBy.length > 0) {
      const ids = labelledBy.split(/\s+/);
      const chunks: string[] = [];
      for (const id of ids) {
        if (id.length === 0) {
          continue;
        }
        const target = document.getElementById(id);
        if (target !== null) {
          chunks.push(visibleTextSlice(target, 80));
        }
      }
      const joined = chunks.join(" ").trim();
      if (joined.length > 0) {
        return joined;
      }
    }
    const al = el.getAttribute("aria-label");
    if (al !== null && al.trim().length > 0) {
      return al.trim();
    }
    const inputId = (el as HTMLInputElement).id;
    if (typeof inputId === "string" && inputId.length > 0) {
      const label = document.querySelector(`label[for="${inputId.replace(/"/g, '\\"')}"]`);
      if (label !== null) {
        const text = (label.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length > 0) {
          return text;
        }
      }
    }
    const ph = (el as HTMLInputElement).placeholder;
    if (typeof ph === "string" && ph.trim().length > 0) {
      return ph.trim();
    }
    const title = el.getAttribute("title");
    if (title !== null && title.trim().length > 0) {
      return title.trim();
    }
    const found = findTestid(el, candidates);
    if (found !== null) {
      return found.value;
    }
    return visibleTextSlice(el, 80);
  }

  function scoreRow(
    isInteractiveEl: boolean,
    hasName: boolean,
    inVp: boolean,
    hasTestid: boolean,
    depth: number
  ): number {
    const depthPenalty = Math.min(depth * 2, 10);
    return (
      (isInteractiveEl ? 50 : 0) +
      (hasName ? 20 : 0) +
      (inVp ? 20 : 0) +
      (hasTestid ? 10 : 0) -
      depthPenalty
    );
  }

  function domDepth(el: Element): number {
    let d = 0;
    let cur: Element | null = el;
    while (cur !== null) {
      d += 1;
      cur = cur.parentElement;
    }
    return d;
  }

  function childFingerprint(el: Element): string {
    return Array.from(el.children)
      .slice(0, 3)
      .map((c) => c.tagName.toLowerCase())
      .join("/");
  }

  function escapeAttrValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // ── Structured-locator derivation (runs against the live DOM at capture) ──────────────────────
  // Produces one render-agnostic locator per element, verifying uniqueness against the WHOLE document
  // for the queryable tiers. Consumers (runtime resolver, codegen) render it; they never re-derive.

  function xpathLiteral(s: string): string {
    if (s.indexOf('"') === -1) return `"${s}"`;
    if (s.indexOf("'") === -1) return `'${s}'`;
    const segs = s.split('"');
    return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
  }

  // `contextRoot` defaults to `document` — but `document.querySelectorAll` cannot see *into* a shadow
  // root, so it also cannot see an element that IS inside one. For a shadow-nested element's own testid,
  // the uniqueness check must run against that element's own shadow root instead, or it always
  // undercounts to 0 (never 1) and a perfectly reliable getByTestId locator gets rejected for nothing.
  function uniqueByCss(selector: string, contextRoot: ParentNode = document): boolean {
    try {
      return contextRoot.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function countByXpath(xp: string): number {
    try {
      const r = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return r.snapshotLength;
    } catch {
      return -1;
    }
  }

  // Last resort before pure position: some markup gives an interactive control zero accessible name
  // (no aria-label, no label association, no own text — nothing T1–T7 can use) while still placing a
  // real, human-readable label right next to it as an unrelated sibling (an app's custom checkbox list
  // with a floating <span> label, never wired up via aria-labelledby). This is a genuine, verified XPath
  // structural match — never fed into getByRole/getByText name matching, since Playwright's own
  // accessible-name algorithm doesn't look at unrelated siblings either and would never match it there.
  // Requires an unambiguous 1:1 relationship: exactly one non-interactive, non-empty-text sibling. Two or
  // more candidates, or none, and this yields nothing — consistent with never guessing when ambiguous.
  function findSiblingTextMatch(el: Element): { text: string; xpath: string } | undefined {
    const parent = el.parentElement;
    if (parent === null) {
      return undefined;
    }
    const candidates: string[] = [];
    for (const sibling of Array.from(parent.children)) {
      if (sibling === el || isInteractive(sibling)) {
        continue;
      }
      const text = elementText(sibling).replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        candidates.push(text);
      }
    }
    if (candidates.length !== 1) {
      return undefined;
    }
    const text = candidates[0];
    if (text === undefined) {
      return undefined;
    }
    const tag = el.tagName.toLowerCase();
    const lit = xpathLiteral(text);
    const xp = `//${tag}[preceding-sibling::*[normalize-space()=${lit}] or following-sibling::*[normalize-space()=${lit}]]`;
    if (countByXpath(xp) !== 1) {
      return undefined;
    }
    return { text, xpath: xp };
  }

  // `pointer-events: none` is a hard browser fact, not a heuristic: an element carrying it can never
  // receive a pointer event, so no locator resolving to it will ever be clickable — this is the actual
  // cause of a real production timeout ("<div class="ms-option"> intercepts pointer events" while trying
  // to click a role=checkbox whose only blocker was this CSS rule on the checkbox itself, delegating the
  // real click handling to its wrapper row). Detected the same way the browser's own hit-testing does.
  function isPointerEventsNone(el: Element): boolean {
    try {
      return window.getComputedStyle(el).pointerEvents === "none";
    } catch {
      return false;
    }
  }

  // The other real-world way a nominally-clickable control can't actually be clicked reliably: the
  // classic "visually hidden, native input" accessibility pattern (Tailwind's `sr-only` and equivalents)
  // — `pointer-events: auto`, but an explicit `width:1px;height:1px` collapses the click target to a
  // single pixel. Confirmed as the actual cause of a real production timeout (a Klarna/Stripe checkout's
  // "Credit or debit card" radio, `class="sr-only"`, `data-testid="payment-method-card-container"`):
  // Playwright resolves and scroll-into-views the input correctly, but at 1x1px any neighbouring content
  // (a payment-method icon, a sticky header) intercepts the exact pixel on essentially every attempt.
  // Reads *computed* width/height (resolved CSS pixel values), not `getBoundingClientRect()` — the box
  // model is knowable from an explicit fixed-length style without full layout, so this stays accurate
  // even where layout-dependent geometry wouldn't be (see the happy-dom test file for why that matters).
  function isEffectivelyZeroSize(el: Element): boolean {
    try {
      const cs = window.getComputedStyle(el);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      return Number.isFinite(w) && Number.isFinite(h) && w <= 1 && h <= 1;
    } catch {
      return false;
    }
  }

  // A control can be `pointer-events: auto`, non-zero-size, and technically clickable, yet still not
  // actually visible to the user — the real-world case that motivated this: a third-party payment SDK
  // (Stripe-style) pre-mounts a card-input iframe before the user has picked a payment method, then
  // mounts a second, real one once they do. Both carry identical role/name/type; only this check tells
  // capture's two "Card number" candidates apart. Distinct from `inViewport` (viewport-bounds geometry
  // only — unaffected by opacity/visibility/display, so a hidden-but-laid-out element still reports
  // in-viewport). Walks ancestors like `isAriaHiddenAncestor` (display:none and opacity:0 on a *wrapper*
  // around the element, not the element itself, is the common real pattern — `getComputedStyle(el)`
  // alone never sees a hiding ancestor's own declared style).
  function isVisuallyHiddenAncestor(el: Element): boolean {
    let cur: Element | null = el;
    while (cur !== null) {
      try {
        const cs = window.getComputedStyle(cur);
        if (cs.display === "none" || cs.visibility === "hidden") {
          return true;
        }
        const opacity = Number.parseFloat(cs.opacity);
        if (Number.isFinite(opacity) && opacity === 0) {
          return true;
        }
      } catch {
        // A detached or cross-realm node mid-check — treat as not-provably-hidden rather than fail.
      }
      const parent: Element | null = cur.parentElement;
      if (parent !== null) {
        cur = parent;
      } else {
        const root = cur.getRootNode();
        cur = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return false;
  }

  // `cursor: pointer` is the conventional visual affordance for "this is clickable", used by custom
  // widgets (a row/card with a framework click binding that leaves no DOM-visible onclick attribute).
  // Only consulted once `isPointerEventsNone` has already confirmed the nominal element can't itself
  // receive the click — so a decorative cursor:pointer elsewhere is never consulted for a normal control.
  function hasClickCursor(el: Element): boolean {
    try {
      return window.getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  }

  // Walk up (crossing shadow-root boundaries like isAriaHiddenAncestor) for the nearest ancestor that can
  // actually receive the click a real user's cursor would land on: not itself pointer-events:none, and
  // carrying the click affordance. Bounded depth — this is a targeted "find the real click delegate for
  // this specific blocked control" search, not an open-ended climb to the document root.
  function findClickDelegateAncestor(el: Element): Element | undefined {
    const MAX_DEPTH = 6;
    let cur: Element | null = el.parentElement;
    if (cur === null) {
      const root = el.getRootNode();
      cur = root instanceof ShadowRoot ? root.host : null;
    }
    let depth = 0;
    while (cur !== null && depth < MAX_DEPTH) {
      if (!isPointerEventsNone(cur) && hasClickCursor(cur)) {
        return cur;
      }
      const parent: Element | null = cur.parentElement;
      if (parent !== null) {
        cur = parent;
      } else {
        const root = cur.getRootNode();
        cur = root instanceof ShadowRoot ? root.host : null;
      }
      depth++;
    }
    return undefined;
  }

  function positionalXpath(el: Element): string {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur !== null && cur.nodeType === Node.ELEMENT_NODE) {
      const node: Element = cur;
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        parts.push(`/${tag}`);
        break;
      }
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      parts.push(`/${tag}[${sameTag.indexOf(node) + 1}]`);
      if (tag === "html") break;
      cur = parent;
    }
    return parts.reverse().join("");
  }

  // Shared name-source fallback chain (aria-labelledby → aria-label → label[for] → placeholder → title →
  // the element's own text) used by both `getLocatorName` and `getTextTierName` below — they differ only
  // in how the final "own text" fallback (and an aria-labelledby target's text) gets extracted, via
  // `textExtractor`, because the two callers feed two Playwright matchers with genuinely different
  // matching algorithms (see the two functions' own comments for why).
  function computeNameFromSources(el: Element, textExtractor: (target: Element) => string): string {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy !== null && labelledBy.length > 0) {
      const chunks: string[] = [];
      for (const id of labelledBy.split(/\s+/)) {
        if (id.length === 0) continue;
        const target = document.getElementById(id);
        if (target !== null) chunks.push(textExtractor(target));
      }
      const joined = chunks.join(" ").trim();
      if (joined.length > 0) return joined;
    }
    const al = el.getAttribute("aria-label");
    if (al !== null && al.trim().length > 0) return al.trim();
    const inputId = (el as HTMLInputElement).id;
    if (typeof inputId === "string" && inputId.length > 0) {
      const label = document.querySelector(`label[for="${inputId.replace(/"/g, '\\"')}"]`);
      if (label !== null) {
        const text = textExtractor(label);
        if (text.length > 0) return text;
      }
    }
    const ph = (el as HTMLInputElement).placeholder;
    if (typeof ph === "string" && ph.trim().length > 0) return ph.trim();
    const title = el.getAttribute("title");
    if (title !== null && title.trim().length > 0) return title.trim();
    return textExtractor(el);
  }

  // ARIA "accessible name" style: space-joins abutting child-element text (why `elementText` inserts a
  // synthetic space per element — real regression this fixed: "ColomboColombo District" → "Colombo
  // Colombo District", see snapshot-engine.test.ts). Matches how Playwright's `getByRole(role, {name})`
  // computes accessible name, so this feeds the `role_name`/`scoped` tiers (rendered via `getByRole`).
  function accessibleNameText(el: Element): string {
    return elementText(el).replace(/\s+/g, " ").trim();
  }

  // Raw rendered-text style: no synthetic spacing at element boundaries, just concatenated text content
  // with real whitespace runs collapsed — matches how Playwright's `getByText(value, {exact:true})`
  // actually matches at *act* time, confirmed live against a real production timeout: a Klarna checkout
  // payment radio's click-delegate label renders "Credit or debit card" and "Secure and encrypted" in
  // adjacent `<div>`s with no whitespace between them in the DOM — `getByText` only ever matched the
  // *unspaced* concatenation ("Credit or debit cardSecure and encrypted"), never the accessible-name-style
  // spaced version `accessibleNameText` would produce, so a `text`-strategy locator built from the latter
  // could never resolve. Feeds *only* the `text` tier (T5) below — `role_name`/`scoped` must keep using
  // `accessibleNameText`, since `getByRole`'s matching algorithm is the ARIA one, not this one.
  function textTierMatchText(el: Element): string {
    return (el.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  // Locator-grade accessible name: full (untruncated), never the test-id value — distinct from the
  // display `name` (capped at 80 chars, test-id fallback). Feeds the `role_name`/`scoped` tiers (getByRole
  // matching) and the reported `name` field — see `getTextTierName` for the `text` tier's own version.
  function getLocatorName(el: Element): string {
    return computeNameFromSources(el, accessibleNameText);
  }

  // Same fallback chain as `getLocatorName`, but built specifically for the `text` strategy tier — see
  // `textTierMatchText`'s comment for why it needs its own, differently-joined value.
  function getTextTierName(el: Element): string {
    return computeNameFromSources(el, textTierMatchText);
  }

  // ARIA roles whose accessible name may come from descendant text ("name from content"). For every
  // other role, getByRole(role,{name}) matches the element's *computed accessible name* — which for a
  // live region like alert/status (text in a child, no aria-label) is empty. Emitting the inner text as
  // a role name there yields a locator Playwright can never match (the OrangeHRM error-alert case).
  // Canonical home + drift guard: snapshot/name-from-content.ts (pinned by name-from-content.test.ts).
  const ROLE_NAME_FROM_CONTENT = [
    "button",
    "link",
    "heading",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "checkbox",
    "switch",
    "tab",
    "treeitem",
    "cell",
    "gridcell",
    "columnheader",
    "rowheader",
    "row",
    "tooltip"
  ];

  // Whether the element carries an author-supplied accessible name (valid for getByRole on any role),
  // as opposed to a name derived from its descendant text.
  function hasAuthorName(el: Element): boolean {
    if ((el.getAttribute("aria-label") ?? "").trim().length > 0) return true;
    if ((el.getAttribute("aria-labelledby") ?? "").length > 0) return true;
    if ((el.getAttribute("title") ?? "").trim().length > 0) return true;
    const id = el.id;
    if (
      typeof id === "string" &&
      id.length > 0 &&
      document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`) !== null
    ) {
      return true;
    }
    const ph = (el as HTMLInputElement).placeholder;
    if (typeof ph === "string" && ph.trim().length > 0) return true;
    return false;
  }

  function deriveStructuredLocator(
    el: Element,
    tag: string,
    role: string,
    foundTestid: { value: string; attr: string } | null,
    projectTestidAttr: string,
    locatorName: string,
    container: { readonly role: string; readonly name: string } | null,
    roleNameUnique: boolean
  ): StructuredLocator | undefined {
    // An element inside an (open) shadow root can never be reached by Playwright's XPath engine — every
    // axis (child/descendant/following/etc.) is blind to shadow-root boundaries, and CSS selectors are
    // forbidden project-wide (rendering rule shared with codegen, see @vindicate/protocol locator.ts). Only
    // the semantic getBy* engines (getByTestId/getByRole/getByLabel/getByPlaceholder/getByText) pierce
    // shadow roots, so the XPath-rendered tiers (T2/T3/T6/T8) are skipped outright for such elements —
    // an `uniqueByCss`/`countByXpath` "unique" result here would be checking the wrong (light-DOM-only)
    // tree and can quietly resolve to a *different*, wrong element (see the hidden-decoy-button case).
    const shadowed = isInShadowDom(el);
    // getByTestId pierces shadow roots at resolution time, so the tier itself is safe — but its
    // capture-time uniqueness check must be scoped to el's own shadow root when shadowed, or
    // `document.querySelectorAll` structurally can't see `el` at all and always reports 0, not 1.
    const testidSearchRoot: ParentNode = shadowed ? (el.getRootNode() as ParentNode) : document;

    // T1 — test-id on the project attribute → getByTestId
    if (foundTestid !== null && foundTestid.attr === projectTestidAttr) {
      if (
        uniqueByCss(
          `[${foundTestid.attr}="${escapeAttrValue(foundTestid.value)}"]`,
          testidSearchRoot
        )
      ) {
        return {
          strategy: "testid",
          confidence: "high",
          attr: foundTestid.attr,
          value: foundTestid.value
        };
      }
    }
    if (!shadowed) {
      // T2 — test-id on another recognised attribute → XPath
      if (foundTestid !== null && foundTestid.attr !== projectTestidAttr) {
        const xp = `//*[@${foundTestid.attr}=${xpathLiteral(foundTestid.value)}]`;
        if (countByXpath(xp) === 1) {
          return {
            strategy: "testid_xpath",
            confidence: "high",
            attr: foundTestid.attr,
            value: foundTestid.value,
            xpath: xp
          };
        }
      }
      // T3 — stable, non-generated id → XPath
      const id = el.id;
      if (typeof id === "string" && id.length > 0 && !isGeneratedDomId(id)) {
        const xp = `//*[@id=${xpathLiteral(id)}]`;
        if (countByXpath(xp) === 1) {
          return { strategy: "dom_id", confidence: "high", value: id, xpath: xp };
        }
      }
    }
    // T4 — role + name, unique within the captured set — but only when that name is one getByRole can
    // match: an author name (any role) or descendant text on a name-from-content role. An alert/status
    // whose text lives in a child is NOT matchable by name (its accessible name is empty).
    if (
      role.length > 0 &&
      locatorName.length > 0 &&
      roleNameUnique &&
      (ROLE_NAME_FROM_CONTENT.indexOf(role) !== -1 || hasAuthorName(el))
    ) {
      return { strategy: "role_name", confidence: "high", role, name: locatorName };
    }
    // T4b — name-prohibited role with no matchable name (e.g. an error alert): target the role alone
    // when it is unique in the document. Codegen/resolver render this as getByRole(role) with no name.
    // Uniqueness is XPath-checked, so — like T2/T3/T6/T8 — this tier is skipped when shadowed.
    if (
      !shadowed &&
      role.length > 0 &&
      role !== "generic" &&
      el.getAttribute("role") === role &&
      countByXpath(`//*[@role=${xpathLiteral(role)}]`) === 1
    ) {
      return { strategy: "role_name", confidence: "low", role };
    }
    // T5 — role-less control: label / placeholder / text name sources
    if (role.length === 0 || role === "generic") {
      const ph = (el as HTMLInputElement).placeholder;
      if (typeof ph === "string" && ph.trim().length > 0) {
        return { strategy: "placeholder", confidence: "high", value: ph.trim() };
      }
      const al = el.getAttribute("aria-label");
      if (al !== null && al.trim().length > 0) {
        return { strategy: "label", confidence: "high", value: al.trim() };
      }
      const textTierName = getTextTierName(el);
      if (textTierName.length > 0) {
        return { strategy: "text", confidence: "high", value: textTierName };
      }
    }
    // T6 — unique stable attribute combination (XPath — skipped when shadowed; see top-of-function note.
    // This is the tier that, unguarded, matched a same-shaped hidden decoy element elsewhere in the
    // light DOM instead of the real shadow-DOM control — e.g. a form's native `<button type="submit">`
    // fallback standing in for a Shadow-DOM-rendered submit button.)
    if (!shadowed) {
      const attrParts: string[] = [];
      const typeAttr = el.getAttribute("type");
      if (typeAttr !== null && typeAttr.length > 0)
        attrParts.push(`@type=${xpathLiteral(typeAttr)}`);
      const nameAttr = el.getAttribute("name");
      if (nameAttr !== null && nameAttr.length > 0)
        attrParts.push(`@name=${xpathLiteral(nameAttr)}`);
      const phAttr = el.getAttribute("placeholder");
      if (phAttr !== null && phAttr.length > 0)
        attrParts.push(`@placeholder=${xpathLiteral(phAttr)}`);
      if (attrParts.length > 0) {
        const xp = `//${tag}[${attrParts.join(" and ")}]`;
        if (countByXpath(xp) === 1) {
          return { strategy: "attr_combo", confidence: "high", xpath: xp };
        }
      }
    }
    // T7 — per-row control scoped to its uniquely-named container row (role-chain rendered, shadow-safe)
    if (container !== null && role.length > 0 && locatorName.length > 0) {
      return { strategy: "scoped", confidence: "high", role, name: locatorName, container };
    }
    // T7b — sibling-text fallback (XPath, shadow-unsafe like T2/T3/T6/T8): only when every name source
    // above has genuinely failed (locatorName empty) — never a substitute for a real accessible name.
    if (!shadowed && locatorName.length === 0) {
      const siblingMatch = findSiblingTextMatch(el);
      if (siblingMatch !== undefined) {
        return {
          strategy: "sibling_text",
          confidence: "high",
          value: siblingMatch.text,
          xpath: siblingMatch.xpath
        };
      }
    }
    if (shadowed) {
      // No semantic tier matched (no testid, no matchable role+name/label/placeholder/text) and every
      // remaining tier is XPath — which is guaranteed to never resolve here. Report "no locator" rather
      // than emit one that would silently time out or, worse, resolve to an unrelated light-DOM element.
      return undefined;
    }
    // T8 — positional last resort (always low confidence)
    return { strategy: "nth", confidence: "low", xpath: positionalXpath(el) };
  }

  interface Row {
    readonly el: Element;
    readonly score: number;
    readonly ref: string;
    readonly role: string;
    readonly name: string;
    readonly tag: string;
    readonly inVp: boolean;
    readonly hasTestid: boolean;
    collapsedSiblings?: number;
    readonly overlaySummary?: boolean;
  }

  function stableRefFor(el: Element, candidates: string[]): string {
    const tag = el.tagName.toLowerCase();
    const found = findTestid(el, candidates);
    if (found !== null) {
      return digestRef(`${tag}${found.value}`);
    }
    const idAttr = el.id ?? "";
    if (idAttr.length > 0 && !isGeneratedDomId(idAttr)) {
      return digestRef(`${tag}${idAttr}`);
    }
    const role = implicitRole(el);
    const name = getAccessibleName(el, testidCandidates);
    if (name.length > 0) {
      return digestRef(`${tag}${role}${name}`);
    }
    return digestRef(`${tag}${domPath(el)}`);
  }

  // Nearest repeating-row ancestor (table row / list item) with a usable accessible name — used to
  // scope a per-row control when its ref collides with sibling rows. Parity: recording-candidate.ts findRepeatingContainer.
  function repeatingContainerAnchor(el: Element): { role: string; name: string } | null {
    let cur: Element | null = el.parentElement;
    while (cur !== null) {
      const tag = cur.tagName.toLowerCase();
      const explicitRole = cur.getAttribute("role");
      if (tag === "tr" || explicitRole === "row" || tag === "li" || explicitRole === "listitem") {
        const role = explicitRole ?? (tag === "tr" ? "row" : "listitem");
        const name = getAccessibleName(cur, testidCandidates);
        return name.length > 0 ? { role, name } : null;
      }
      if (explicitRole === "gridcell" || tag === "td") {
        const row = cur.closest('[role="row"], tr');
        if (row !== null) {
          const role = row.getAttribute("role") ?? "row";
          const name = getAccessibleName(row, testidCandidates);
          return name.length > 0 ? { role, name } : null;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Shared with the scope-root resolution below: identifies an element folded by the overlay-flood
  // collapse (a modal/dialog/listbox/menu/open popover), so scoping into its own ref descends into its
  // contents rather than escaping to its parent the way an ordinary leaf-anchor ref does.
  const OVERLAY_SELECTOR =
    '[aria-modal="true"],[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"],[popover]';

  // Topmost open overlay (modal/dialog/listbox/menu/open popover) that is currently rendered. Used both
  // to de-flood a read when a large overlay (e.g. a date-picker grid) would otherwise crowd out the page,
  // and to announce the overlay at the top of the read (so the agent knows the page may be blocked) — the
  // announcement is independent of the flood threshold, so even a tiny blocking popup is surfaced.
  function detectTopmostOverlay(): Element | null {
    const visible = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (visible.length === 0) {
      return null;
    }
    visible.sort((a, b) => {
      const zaRaw = Number.parseInt(window.getComputedStyle(a).zIndex ?? "0", 10);
      const zbRaw = Number.parseInt(window.getComputedStyle(b).zIndex ?? "0", 10);
      const za = Number.isFinite(zaRaw) ? zaRaw : 0;
      const zb = Number.isFinite(zbRaw) ? zbRaw : 0;
      if (za !== zb) {
        return zb - za;
      }
      // Same stacking context signal: later-in-DOM tends to paint on top.
      const rel = a.compareDocumentPosition(b);
      if ((rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
        return 1;
      }
      if ((rel & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
        return -1;
      }
      return 0;
    });
    return visible[0] ?? null;
  }

  // "Blocking" means likely to intercept interaction with the page behind it. We treat aria-modal as
  // authoritative and also consider alertdialogs blocking by default.
  function isBlockingOverlay(el: Element): boolean {
    if (el.getAttribute("aria-modal") === "true") {
      return true;
    }
    const role = el.getAttribute("role") ?? implicitRole(el);
    return role === "alertdialog";
  }

  let root: Element = document.documentElement;

  if (opts.scopeDescriptor !== undefined) {
    const sd = opts.scopeDescriptor;
    let hit: Element | null = null;
    if (sd.testid !== undefined && sd.testid.length > 0) {
      hit = document.querySelector(`[${sd.testidAttr}="${sd.testid.replace(/"/g, '\\"')}"]`);
    } else if (sd.domId !== undefined && sd.domId.length > 0) {
      hit = document.getElementById(sd.domId);
    } else if (
      sd.role !== undefined &&
      sd.name !== undefined &&
      sd.role.length > 0 &&
      sd.name.length > 0
    ) {
      for (const el of Array.from(document.querySelectorAll(`[role="${sd.role}"]`))) {
        if (getAccessibleName(el, [sd.testidAttr]) === sd.name) {
          hit = el;
          break;
        }
      }
      if (hit === null) {
        for (const el of Array.from(
          document.querySelectorAll("button,a,input,select,textarea,details")
        )) {
          if (implicitRole(el) === sd.role && getAccessibleName(el, [sd.testidAttr]) === sd.name) {
            hit = el;
            break;
          }
        }
      }
    } else if (sd.tag.length > 0) {
      let selector = sd.tag;
      if (sd.type !== undefined && sd.type.length > 0) {
        selector += `[type="${escapeAttrValue(sd.type)}"]`;
      }
      if (sd.placeholder !== undefined && sd.placeholder.length > 0) {
        selector += `[placeholder="${escapeAttrValue(sd.placeholder)}"]`;
      }
      const matches = Array.from(document.querySelectorAll(selector));
      if (matches.length === 1) {
        hit = matches[0] ?? null;
      } else if (matches.length > 1 && sd.name !== undefined && sd.name.length > 0) {
        hit = matches.find((el) => getAccessibleName(el, [sd.testidAttr]) === sd.name) ?? null;
      } else if (matches.length > 1) {
        hit = matches[0] ?? null;
      }
    }
    if (hit === null) {
      return {
        elements: [],
        truncated: false,
        collapsed_count: 0,
        alerts: [],
        error: "ref_not_found"
      };
    }
    // An overlay/dialog ref (the flood-collapse summary row) scopes into its own contents — "scope into
    // it to read its items" is the documented contract for a folded overlay. Every other (ordinary leaf
    // interactive element) ref keeps anchoring to its parent/section instead, per the existing contract.
    root = hit.matches(OVERLAY_SELECTOR) ? hit : (hit.parentElement ?? hit);
  } else if (opts.scopeCss !== undefined && opts.scopeCss.length > 0) {
    const hit = document.querySelector(opts.scopeCss);
    if (hit === null) {
      return {
        elements: [],
        truncated: false,
        collapsed_count: 0,
        alerts: [],
        error: "css_not_found"
      };
    }
    root = hit;
  }

  const testidCandidates = opts.testidCandidates;
  const rows: Row[] = [];

  function visitCandidate(el: Element): void {
    if (!(isInteractive(el) || findTestid(el, testidCandidates) !== null)) {
      return;
    }
    if (isAriaHiddenAncestor(el)) {
      return;
    }
    if (opts.viewportOnly && !inViewport(el)) {
      return;
    }
    const tag = el.tagName.toLowerCase();
    const role = implicitRole(el);
    const name = getAccessibleName(el, testidCandidates);
    const foundTestid = findTestid(el, testidCandidates);
    const inVp = inViewport(el);
    const hasTestid = foundTestid !== null;
    const depth = domDepth(el);
    const score = scoreRow(true, name.length > 0, inVp, hasTestid, depth);
    const ref = stableRefFor(el, testidCandidates);
    rows.push({ el, score, ref, role, name, tag, inVp, hasTestid });
  }

  // A plain TreeWalker never descends into a shadow root — it's a separate tree, invisible to every
  // standard DOM traversal API (TreeWalker, querySelectorAll, XPath), not just this one. Recursing into
  // `.shadowRoot` here is what actually lets us see (and later, via getByRole/getByTestId, resolve)
  // controls rendered inside Shadow-DOM web components (Ionic, Shoelace, Lit, etc.) instead of only
  // their light-DOM host element — or nothing at all.
  function walkComposedTree(walkRoot: Node): void {
    const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node !== null) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        visitCandidate(el);
        if (el.shadowRoot !== null) {
          walkComposedTree(el.shadowRoot);
        }
      }
      node = walker.nextNode();
    }
  }
  walkComposedTree(root);

  if (opts.includeVerifiable) {
    for (const el of captureVerifiable()) {
      const existingRef = stableRefFor(el, testidCandidates);
      if (rows.some((r) => r.ref === existingRef)) {
        continue;
      }
      const tag = el.tagName.toLowerCase();
      const role = implicitRole(el);
      const name = getAccessibleName(el, testidCandidates);
      const foundTestid = findTestid(el, testidCandidates);
      const inVp = inViewport(el);
      const depth = domDepth(el);
      const score = scoreRow(false, name.length > 0, inVp, foundTestid !== null, depth);
      rows.push({
        el,
        score,
        ref: existingRef,
        role,
        name,
        tag,
        inVp,
        hasTestid: foundTestid !== null
      });
    }
  }

  // Plain-text capture — see captureScopedText's own comment for why this only fires on an explicitly
  // scoped read (root !== documentElement means scopeDescriptor or scopeCss actually resolved to
  // something narrower than the whole page).
  if (root !== document.documentElement) {
    for (const el of captureScopedText(root)) {
      const existingRef = stableRefFor(el, testidCandidates);
      if (rows.some((r) => r.ref === existingRef)) {
        continue;
      }
      const tag = el.tagName.toLowerCase();
      const role = implicitRole(el);
      const name = getAccessibleName(el, testidCandidates);
      const foundTestid = findTestid(el, testidCandidates);
      const inVp = inViewport(el);
      const depth = domDepth(el);
      const score = scoreRow(false, name.length > 0, inVp, foundTestid !== null, depth);
      rows.push({
        el,
        score,
        ref: existingRef,
        role,
        name,
        tag,
        inVp,
        hasTestid: foundTestid !== null
      });
    }
  }

  // Raw sibling count alone can't reliably tell "a large repeated data list" (search results, a table,
  // an event feed) from "a large but completely static nav menu / toolbar" — real permanent chrome can
  // legitimately run past a dozen items (a 19-entry sidebar is unremarkable). A count threshold is still
  // needed as the general-purpose backstop for the common case of a plain, uninstrumented HTML list/table
  // (no reliable non-count signal exists there at all), but a *lower* bar is safe specifically when the
  // bucket's own elements carry the project's test-id attribute — that's a deliberate developer signal
  // ("I instrumented this for automation"), and in practice such IDs are given to genuinely-repeated data
  // rows, not to a hand-authored, one-off navigation menu. So: trust a small testid-carrying bucket sooner,
  // and require a much larger uninstrumented bucket before assuming it's a data flood rather than chrome.
  const TESTID_INSTRUMENTED_COLLAPSE_THRESHOLD = 12;
  const UNINSTRUMENTED_COLLAPSE_THRESHOLD = 25;

  let collapsedCount = 0;
  let working = rows;
  if (opts.collapse) {
    const byParent = new Map<Element | null, Row[]>();
    for (const r of rows) {
      const p = r.el.parentElement;
      const list = byParent.get(p) ?? [];
      list.push(r);
      byParent.set(p, list);
    }
    const omit = new Set<Element>();
    for (const [, group] of byParent) {
      const buckets = new Map<string, Row[]>();
      for (const r of group) {
        const fp = childFingerprint(r.el);
        const key = `${r.tag}|${r.role}|${fp}`;
        const b = buckets.get(key) ?? [];
        b.push(r);
        buckets.set(key, b);
      }
      for (const [, g] of buckets) {
        const testidRatio = g.filter((r) => r.hasTestid).length / g.length;
        const threshold =
          testidRatio >= 0.5
            ? TESTID_INSTRUMENTED_COLLAPSE_THRESHOLD
            : UNINSTRUMENTED_COLLAPSE_THRESHOLD;
        if (g.length >= threshold) {
          g.sort((a, b) => b.score - a.score);
          const head = g[0];
          if (head !== undefined) {
            head.collapsedSiblings = g.length - 1;
            collapsedCount += g.length - 1;
            for (let i = 1; i < g.length; i += 1) {
              const o = g[i];
              if (o !== undefined) {
                omit.add(o.el);
              }
            }
          }
        }
      }
    }
    working = rows.filter((r) => !omit.has(r.el));
  }

  // Overlay flood collapse: when a large open overlay sits strictly inside a non-ref-scoped capture
  // root, replace its many interactive descendants with one summary row so it doesn't crowd out the
  // rest of the page (the dropped Search button / calendar-pollutes-scope cases). Scope into it to read.
  const OVERLAY_FLOOD_THRESHOLD = 12;
  const topOverlay = detectTopmostOverlay();
  const overlayForCollapse = opts.scopeDescriptor === undefined ? topOverlay : null;
  if (
    overlayForCollapse !== null &&
    overlayForCollapse !== root &&
    root.contains(overlayForCollapse) &&
    !overlayForCollapse.contains(root)
  ) {
    const inside = working.filter((r) => overlayForCollapse.contains(r.el));
    if (inside.length >= OVERLAY_FLOOD_THRESHOLD) {
      const insideSet = new Set<Element>(inside.map((r) => r.el));
      working = working.filter((r) => !insideSet.has(r.el));
      working.push({
        el: overlayForCollapse,
        score: Number.MAX_SAFE_INTEGER,
        ref: stableRefFor(overlayForCollapse, testidCandidates),
        role: overlayForCollapse.getAttribute("role") ?? implicitRole(overlayForCollapse),
        name: getAccessibleName(overlayForCollapse, testidCandidates),
        tag: overlayForCollapse.tagName.toLowerCase(),
        inVp: inViewport(overlayForCollapse),
        hasTestid: findTestid(overlayForCollapse, testidCandidates) !== null,
        collapsedSiblings: inside.length,
        overlaySummary: true
      });
    } else if (!working.some((r) => r.el === overlayForCollapse)) {
      // Below the flood threshold the overlay's own descendants stay as ordinary rows (unchanged), but
      // the overlay container itself still needs a row of its own — confirmed live bug otherwise: the
      // banner below announces this exact element with "scope into it", yet without a registered row
      // here it never enters the session's ref-descriptor map, so `scope:{ref}` against that announced
      // ref always throws "not found", no matter how fresh the read. No collapsedSiblings/overlaySummary
      // here — nothing was folded, this only makes the announced ref actually resolvable.
      working.push({
        el: overlayForCollapse,
        score: Number.MAX_SAFE_INTEGER,
        ref: stableRefFor(overlayForCollapse, testidCandidates),
        role: overlayForCollapse.getAttribute("role") ?? implicitRole(overlayForCollapse),
        name: getAccessibleName(overlayForCollapse, testidCandidates),
        tag: overlayForCollapse.tagName.toLowerCase(),
        inVp: inViewport(overlayForCollapse),
        hasTestid: findTestid(overlayForCollapse, testidCandidates) !== null
      });
    }
  }

  // Announce the overlay regardless of how many controls it holds (the flood-collapse above only fires
  // at ≥12). A small but `aria-modal` popup (sign-in promo, cookie wall) blocks the page yet would
  // otherwise just appear as a couple of loose rows with no hint it intercepts clicks behind it.
  const overlayActive: OverlayActiveWire | undefined =
    topOverlay !== null
      ? {
          ref: stableRefFor(topOverlay, testidCandidates),
          role: topOverlay.getAttribute("role") ?? implicitRole(topOverlay),
          name: getAccessibleName(topOverlay, testidCandidates),
          modal: isBlockingOverlay(topOverlay)
        }
      : undefined;

  working.sort((a, b) => b.score - a.score);
  const max = opts.maxNodes;
  const truncated = working.length > max;
  const slice = working.slice(0, max);

  // Refs that collide within this capture (same role+name digest on >1 element) — these get a
  // repeating-row container anchor so resolution can scope a per-row control to its named row.
  // Counted over the full captured set (not the truncated/collapsed slice) so an element's ref stays
  // stable across reads regardless of whether its sibling survived truncation or collapse.
  const refCounts = new Map<string, number>();
  for (const r of rows) {
    refCounts.set(r.ref, (refCounts.get(r.ref) ?? 0) + 1);
  }

  const projectTestidAttr = testidCandidates[0] ?? "data-testid";
  const elements: InteractiveElementWire[] = [];
  for (const r of slice) {
    const el = r.el;
    const foundTestid = findTestid(el, testidCandidates);
    const inputType =
      el.tagName.toLowerCase() === "input" ? (el as HTMLInputElement).type : undefined;
    const value =
      "value" in el && typeof (el as HTMLInputElement).value === "string"
        ? (el as HTMLInputElement).value
        : undefined;
    const placeholder =
      "placeholder" in el && typeof (el as HTMLInputElement).placeholder === "string"
        ? (el as HTMLInputElement).placeholder
        : undefined;
    const disabled =
      "disabled" in el
        ? Boolean((el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled)
        : false;
    const notVisible = isVisuallyHiddenAncestor(el);
    // A colliding ref inside a uniquely-named row gets a distinct, stable ref (re-digested with the
    // row anchor) so each row resolves to its own scoped locator instead of collapsing to one descriptor.
    const container =
      (refCounts.get(r.ref) ?? 0) > 1 && foundTestid === null ? repeatingContainerAnchor(el) : null;
    const ref =
      container !== null ? digestRef(`${r.tag}${r.role}${r.name}|row:${container.name}`) : r.ref;

    // A pointer-events:none control can never itself receive a click, and a 1x1px control (the sr-only
    // visually-hidden-input pattern) can technically receive one but not reliably — any locator resolving
    // to either is guaranteed to hang or flake at act time. Reported role/name/tag stay this element's own
    // (so the agent still sees "radio 'Credit or debit card'"), but the locator, if any, is derived from
    // the real click delegate instead. No delegate found means no safe locator exists at all — never fall
    // back to deriving one for el itself here, same "honest no-locator over a broken one" rule the
    // shadow-DOM path already follows below.
    let clickDelegate = false;
    let locator: StructuredLocator | undefined;
    if (isPointerEventsNone(el) || isEffectivelyZeroSize(el)) {
      const delegate = findClickDelegateAncestor(el);
      if (delegate !== undefined) {
        const delegateTag = delegate.tagName.toLowerCase();
        const delegateRole = implicitRole(delegate);
        const delegateTestid = findTestid(delegate, testidCandidates);
        // roleNameUnique is deliberately always false here: it's an externally-computed "is this role+name
        // combo unique across the whole capture" signal (see refCounts below), not self-verified inside
        // T4 the way the XPath tiers are. The delegate was never itself row-captured, so there is no real
        // collision count to look up for it — passing anything but a conservative false would let T4 trust
        // a made-up uniqueness signal (e.g. a delegate with role="button" — a common real pattern for a
        // custom-styled clickable div — could then wrongly claim uniqueness). Falling through to
        // T4b/T6/T7b (self-verified) or T5 (pre-existing, same-risk-as-elsewhere) is the safe choice.
        const delegateLocator = deriveStructuredLocator(
          delegate,
          delegateTag,
          delegateRole,
          delegateTestid,
          projectTestidAttr,
          getLocatorName(delegate),
          repeatingContainerAnchor(delegate),
          false
        );
        // Stamped onto the locator itself (not just the wire row below) so it survives a codegen
        // schema built from a verbatim copy of this locator — see StructuredLocator.click_delegate.
        locator =
          delegateLocator !== undefined ? { ...delegateLocator, click_delegate: true } : undefined;
        clickDelegate = locator !== undefined;
      }
    } else {
      locator = deriveStructuredLocator(
        el,
        r.tag,
        r.role,
        foundTestid,
        projectTestidAttr,
        getLocatorName(el),
        container,
        (refCounts.get(r.ref) ?? 1) === 1
      );
    }

    const wire: InteractiveElementWire = {
      ref,
      tag: r.tag,
      role: r.role,
      name: r.name,
      ...(locator !== undefined ? { locator } : {}),
      ...(clickDelegate ? { click_delegate: true } : {}),
      ...(container !== null ? { container } : {}),
      ...(foundTestid !== null ? { testid: foundTestid.value, testid_attr: foundTestid.attr } : {}),
      ...(el.id.length > 0 && !isGeneratedDomId(el.id) ? { dom_id: el.id } : {}),
      ...(inputType !== undefined ? { type: inputType } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(placeholder !== undefined && placeholder.length > 0 ? { placeholder } : {}),
      ...(disabled ? { disabled: true } : {}),
      ...(notVisible ? { visible: false } : {}),
      in_viewport: r.inVp,
      ...(r.collapsedSiblings !== undefined ? { collapsed_siblings: r.collapsedSiblings } : {}),
      ...(r.overlaySummary === true ? { overlay: true } : {}),
      aria_invalid: stripMixed(parseAriaBool(el.getAttribute("aria-invalid"))),
      aria_busy: stripMixed(parseAriaBool(el.getAttribute("aria-busy"))),
      aria_expanded: stripMixed(parseAriaBool(el.getAttribute("aria-expanded"))),
      aria_checked: parseAriaBool(el.getAttribute("aria-checked")),
      aria_selected: stripMixed(parseAriaBool(el.getAttribute("aria-selected"))),
      aria_required: stripMixed(parseAriaBool(el.getAttribute("aria-required"))),
      aria_pressed: parseAriaBool(el.getAttribute("aria-pressed")),
      aria_haspopup: stripMixed(parseAriaBool(el.getAttribute("aria-haspopup"))),
      context: getNearestLandmark(el)
    };
    elements.push(wire);
  }

  return {
    elements,
    truncated,
    collapsed_count: collapsedCount,
    alerts: captureAlerts(),
    ...(overlayActive !== undefined ? { overlay_active: overlayActive } : {})
  };
}

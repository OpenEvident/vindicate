/**
 * @file Browser-side page snapshot for manual recording steps — passed to `page.evaluate()` only.
 */
import type { SelectorCandidatePayload } from "./recording.types.js";

export interface RecordingPageSnapshotCaptureOpts {
  readonly testidCandidates: string[];
  readonly maxElements?: number;
  readonly recorderHostId?: string;
}

export interface RecordingPageSnapshotElementWire {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly tag: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly aria_invalid?: boolean | null;
  readonly aria_required?: boolean | null;
  /**
   * Set when this element itself can't reliably receive a click directly — computed `pointer-events: none`
   * (can never receive one), or collapsed to an explicit ~1x1px box (the sr-only visually-hidden-input
   * pattern) — and `candidates`/`chosen` were derived from the real click-delegate ancestor instead.
   * Clicking works, `check`/`uncheck` do not (the delegate isn't itself a checkbox/radio).
   */
  readonly click_delegate?: boolean;
  readonly candidates: SelectorCandidatePayload[];
  readonly chosen: SelectorCandidatePayload | null;
  readonly element: {
    readonly role?: string;
    readonly name?: string;
    readonly tag: string;
    readonly id?: string;
    readonly placeholder?: string;
  };
}

export interface RecordingPageSnapshotWire {
  readonly url: string;
  readonly title: string;
  readonly alerts: string[];
  readonly truncated: boolean;
  readonly elements: RecordingPageSnapshotElementWire[];
}

/** Runs in the browser — do not import Node built-ins here. */
export function captureRecordingPageSnapshot(
  opts: RecordingPageSnapshotCaptureOpts
): RecordingPageSnapshotWire {
  const TESTID_CANDIDATES = opts.testidCandidates;
  const maxElements = opts.maxElements ?? 150;
  const recorderHostId = opts.recorderHostId ?? "__vindicate-recorder-host";

  function digestRef(s: string): string {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return `ref-${(h >>> 0).toString(16).padStart(8, "0")}`;
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

  // Space-join descendant text (ARIA accessible-name spacing) so abutting child elements don't run
  // together ("ColomboColombo District" → "Colombo Colombo District"). No de-duplication.
  function elementText(el: Element): string {
    let out = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent ?? "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        out += ` ${elementText(node as Element)} `;
      }
    }
    return out;
  }

  function getAccessibleName(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      return ariaLabel;
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl) {
        return lbl.textContent?.trim() ?? "";
      }
    }
    const htmlEl = el as HTMLElement;
    const maybeLabels = (htmlEl as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null })
      .labels;
    if (maybeLabels !== undefined && maybeLabels !== null && maybeLabels.length > 0) {
      return maybeLabels[0]?.textContent?.trim() ?? "";
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      return placeholder;
    }
    const text = elementText(el).replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length < 80) {
      return text;
    }
    return "";
  }

  /**
   * Same fallback chain as `getAccessibleName`, but for the `text` strategy candidate specifically —
   * which Playwright renders via `getByText(value, { exact: true })` at act time, a genuinely different
   * matching algorithm from `getByRole(role, { name })` (which `role_name`/`scoped` candidates use
   * `getAccessibleName` for). `getByRole` matches the ARIA accessible name — why `elementText` inserts a
   * synthetic space per child element ("ColomboColombo District" → "Colombo Colombo District").
   * `getByText` matches raw concatenated text content instead, with no such insertion: confirmed live
   * against a real production timeout — a Klarna checkout payment radio's click-delegate label renders
   * "Credit or debit card" and "Secure and encrypted" in adjacent `<div>`s with no whitespace between
   * them in the DOM, and `getByText` only ever matched the *unspaced* concatenation, never the
   * accessible-name-style spaced version `getAccessibleName` would produce.
   */
  function getTextCandidateName(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      return ariaLabel;
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl) {
        return lbl.textContent?.trim() ?? "";
      }
    }
    const htmlEl = el as HTMLElement;
    const maybeLabels = (htmlEl as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null })
      .labels;
    if (maybeLabels !== undefined && maybeLabels !== null && maybeLabels.length > 0) {
      return maybeLabels[0]?.textContent?.trim() ?? "";
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      return placeholder;
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length < 80) {
      return text;
    }
    return "";
  }

  function getCssSelector(el: Element): string {
    function isGeneratedDomId(id: string): boolean {
      return (
        /^[a-z]+-[0-9a-f]{6,}$/i.test(id) ||
        /^\d+$/.test(id) ||
        /^[a-z0-9_]*-?:[a-z0-9]+:$/i.test(id) ||
        /^sc-[A-Za-z]/.test(id)
      );
    }
    if (el.id && !isGeneratedDomId(el.id) && !/^[0-9]/.test(el.id)) {
      return `#${el.id}`;
    }
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    const name = el.getAttribute("name");
    if (type) {
      return `${tag}[type="${type}"]`;
    }
    if (name) {
      return `${tag}[name="${name}"]`;
    }
    return tag;
  }

  function getXPath(el: Element, foundTestid: { value: string; attr: string } | null): string {
    if (foundTestid !== null) {
      return `//*[@${foundTestid.attr}="${foundTestid.value.replace(/"/g, '\\"')}"]`;
    }
    const tag = el.tagName.toLowerCase();
    const id = el.id;
    if (id && !/^[0-9]/.test(id)) {
      return `//${tag}[@id="${id}"]`;
    }
    const label = el.getAttribute("aria-label");
    if (label) {
      return `//${tag}[@aria-label="${label}"]`;
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      return `//${tag}[@placeholder="${placeholder}"]`;
    }
    return `//${tag}`;
  }

  /**
   * ARIA implicit role for an element with no explicit `role` attribute — NOT the tag name itself.
   * `<tr>`'s implicit role is "row", not "tr"; `getByRole('tr', ...)` matches nothing in a real browser
   * (Playwright resolves against the computed accessibility tree, not raw tag names). Mirrors
   * `interactive-capture.evaluate.ts`'s `implicitRole`, plus the container-row mappings
   * `findRepeatingContainer` below needs (`tr`→row, `li`→listitem, `td`→gridcell).
   */
  function implicitRole(el: Element): string {
    const explicit = el.getAttribute("role");
    if (explicit !== null && explicit.length > 0) {
      return explicit;
    }
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "button":
        return "button";
      case "a":
        return el.hasAttribute("href") ? "link" : "generic";
      case "input": {
        const t = (el as HTMLInputElement).type?.toLowerCase() ?? "text";
        if (t === "checkbox") return "checkbox";
        if (t === "radio") return "radio";
        if (t === "range") return "slider";
        if (t === "number") return "spinbutton";
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
      case "tr":
        return "row";
      case "li":
        return "listitem";
      case "td":
        return "gridcell";
      default:
        return "generic";
    }
  }

  function buildScopedCandidate(el: Element): SelectorCandidatePayload | null {
    function findRepeatingContainer(node: Element): Element | null {
      let current: Element | null = node.parentElement;
      while (current !== null) {
        const tag = current.tagName.toLowerCase();
        const role = current.getAttribute("role");
        if (
          tag === "tr" ||
          tag === "li" ||
          role === "row" ||
          role === "listitem" ||
          role === "gridcell"
        ) {
          if (role === "gridcell") {
            return current.closest("[role=row], tr") ?? current;
          }
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }
    const container = findRepeatingContainer(el);
    if (container === null) {
      return null;
    }
    const rowRole = implicitRole(container);
    const rowName = getAccessibleName(container);
    if (rowName.length === 0) {
      return null;
    }
    const targetRole = implicitRole(el);
    const targetName = getAccessibleName(el);
    if (targetName.length === 0) {
      return null;
    }
    return {
      strategy: "scoped",
      value: `${targetRole}[name="${targetName}"]`,
      container: { role: rowRole, name: rowName },
      strength: "strong"
    };
  }

  // parity: interactive-capture.evaluate.ts xpathLiteral
  function xpathLiteral(s: string): string {
    if (s.indexOf('"') === -1) return `"${s}"`;
    if (s.indexOf("'") === -1) return `'${s}'`;
    const segs = s.split('"');
    return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
  }

  // Last resort before position: no accessible name at all (broken/unlabeled markup). If exactly one
  // non-interactive sibling carries text, that's still an unambiguous, human-readable identifier.
  // Mirrors `recording-candidate.ts`'s `buildSiblingTextCandidate` / capture's `findSiblingTextMatch`.
  // `value` is a real resolvable XPath (this data model has no separate `xpath` field) so playback
  // renders it the same way as `attr_combo`/`nth`.
  function buildSiblingTextCandidate(el: Element): SelectorCandidatePayload | null {
    const parent = el.parentElement;
    if (parent === null) {
      return null;
    }
    const texts: string[] = [];
    for (const sibling of Array.from(parent.children)) {
      if (sibling === el || isInteractive(sibling)) {
        continue;
      }
      const text = getAccessibleName(sibling);
      if (text.length > 0) {
        texts.push(text);
      }
    }
    if (texts.length !== 1) {
      return null;
    }
    const text = texts[0];
    if (text === undefined) {
      return null;
    }
    const tag = el.tagName.toLowerCase();
    const lit = xpathLiteral(text);
    const xp = `//${tag}[preceding-sibling::*[normalize-space()=${lit}] or following-sibling::*[normalize-space()=${lit}]]`;
    return { strategy: "sibling_text", value: xp, strength: "medium" };
  }

  function buildCandidates(el: Element): SelectorCandidatePayload[] {
    function isGeneratedDomId(id: string): boolean {
      return (
        /^[a-z]+-[0-9a-f]{6,}$/i.test(id) ||
        /^\d+$/.test(id) ||
        /^[a-z0-9_]*-?:[a-z0-9]+:$/i.test(id) ||
        /^sc-[A-Za-z]/.test(id)
      );
    }
    const candidates: SelectorCandidatePayload[] = [];
    const foundTestid = findTestid(el, TESTID_CANDIDATES);
    if (foundTestid !== null) {
      candidates.push({
        strategy: "testid",
        value: foundTestid.value,
        attr: foundTestid.attr,
        strength: "strong"
      });
    }
    const scoped = buildScopedCandidate(el);
    if (scoped !== null) {
      candidates.push(scoped);
    }
    if (el.id.length > 0 && !isGeneratedDomId(el.id)) {
      candidates.push({ strategy: "dom_id", value: el.id, strength: "strong" });
    }
    const role = implicitRole(el);
    const name = getAccessibleName(el);
    // Only offer a role_name candidate when the name is matchable by getByRole(role,{name}): an author
    // name (any role), or descendant text on a name-from-content role. alert/status text in a child is
    // not the element's accessible name — skip it and let attr_combo/nth carry the locator.
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
    const labels = (el as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null }).labels;
    const authorName =
      (el.getAttribute("aria-label") ?? "").length > 0 ||
      (el.getAttribute("aria-labelledby") ?? "").length > 0 ||
      (el.getAttribute("title") ?? "").length > 0 ||
      (labels !== undefined && labels !== null && labels.length > 0) ||
      (el.getAttribute("placeholder") ?? "").length > 0;
    if (name.length > 0 && (ROLE_NAME_FROM_CONTENT.indexOf(role) !== -1 || authorName)) {
      candidates.push({
        strategy: "role_name",
        value: `${role}[name="${name}"]`,
        strength: "strong"
      });
    }
    // Role-less container (no explicit role attribute, not a form-control tag with its own name
    // semantics) with real text — e.g. a custom multi-select row div whose own text is its label.
    // getByText matches the same way capture's T5 tier does; skipped for form-control tags since
    // role_name/getByRole is the more precise match there when one applies.
    const tag = el.tagName.toLowerCase();
    const isFormControlTag = ["input", "select", "textarea", "button", "a"].indexOf(tag) !== -1;
    if (el.getAttribute("role") === null && !isFormControlTag) {
      const textCandidateName = getTextCandidateName(el);
      if (textCandidateName.length > 0) {
        candidates.push({ strategy: "text", value: textCandidateName, strength: "medium" });
      }
    }
    const typeAttr = el.getAttribute("type");
    const nameAttr = el.getAttribute("name");
    const attrParts: string[] = [];
    if (typeAttr !== null && typeAttr.length > 0) attrParts.push(`@type="${typeAttr}"`);
    if (nameAttr !== null && nameAttr.length > 0) attrParts.push(`@name="${nameAttr}"`);
    if (attrParts.length > 0) {
      candidates.push({
        strategy: "attr_combo",
        value: `//${tag}[${attrParts.join(" and ")}]`,
        strength: "medium"
      });
    }
    if (name.length === 0) {
      const siblingText = buildSiblingTextCandidate(el);
      if (siblingText !== null) {
        candidates.push(siblingText);
      }
    }
    candidates.push({ strategy: "nth", value: getXPath(el, foundTestid), strength: "weak" });
    return candidates;
  }

  // parity: interactive-capture.evaluate.ts isPointerEventsNone/isEffectivelyZeroSize/hasClickCursor/
  // findClickDelegateAncestor. This file walks the DOM structurally (like the agent-capture path), not
  // from a real dispatched click event — so it needs the same fix: a pointer-events:none control can
  // never itself receive a click, and a 1x1px control (the sr-only visually-hidden-input pattern) can
  // technically receive one but not reliably — either way, any locator resolving to it is guaranteed to
  // hang or flake.
  function isPointerEventsNone(el: Element): boolean {
    try {
      return window.getComputedStyle(el).pointerEvents === "none";
    } catch {
      return false;
    }
  }

  // Reads *computed* width/height (resolved CSS pixel values), not `getBoundingClientRect()` — see
  // interactive-capture.evaluate.ts's copy of this function for why that distinction matters.
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

  function hasClickCursor(el: Element): boolean {
    try {
      return window.getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  }

  function findClickDelegateAncestor(el: Element): Element | undefined {
    const MAX_DEPTH = 6;
    let cur: Element | null = el.parentElement;
    let depth = 0;
    while (cur !== null && depth < MAX_DEPTH) {
      if (!isPointerEventsNone(cur) && hasClickCursor(cur)) {
        return cur;
      }
      cur = cur.parentElement;
      depth++;
    }
    return undefined;
  }

  function chooseBestCandidate(
    candidates: SelectorCandidatePayload[]
  ): SelectorCandidatePayload | null {
    const nonDynamic = candidates.filter((c) => c.dynamic !== true);
    const pool = nonDynamic.length > 0 ? nonDynamic : candidates;
    for (const strategy of [
      "testid",
      "scoped",
      "dom_id",
      "role_name",
      "text",
      "attr_combo",
      "sibling_text",
      "nth"
    ] as const) {
      const hit = pool.find((c) => c.strategy === strategy);
      if (hit !== undefined) {
        return hit;
      }
    }
    return pool[0] ?? null;
  }

  function buildElementMeta(el: Element): RecordingPageSnapshotElementWire["element"] {
    const placeholder = el.getAttribute("placeholder");
    return {
      role: implicitRole(el),
      name: getAccessibleName(el),
      tag: el.tagName.toLowerCase(),
      ...(el.id ? { id: el.id } : {}),
      ...(placeholder !== null && placeholder.length > 0 ? { placeholder } : {})
    };
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
    return el.getAttribute("tabindex") === "0";
  }

  function isActionable(el: Element): boolean {
    return isInteractive(el) || findTestid(el, TESTID_CANDIDATES) !== null;
  }

  function stableRefFor(el: Element): string {
    const foundTestid = findTestid(el, TESTID_CANDIDATES);
    if (foundTestid !== null) {
      return digestRef(`${foundTestid.attr}=${foundTestid.value}`);
    }
    const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
    const name = getAccessibleName(el);
    if (name.length > 0) {
      return digestRef(`${role}:${name}`);
    }
    if (el.id && el.id.length > 0) {
      return digestRef(`id:${el.id}`);
    }
    return digestRef(getCssSelector(el));
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
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text.length > 0) {
          alerts.push(text);
        }
      }
    }
    return [...new Set(alerts)];
  }

  function inputValue(el: Element): string | undefined {
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") {
      return undefined;
    }
    const value = (el as HTMLInputElement).value;
    return value.length > 0 ? value : undefined;
  }

  const elements: RecordingPageSnapshotElementWire[] = [];
  const seen = new Set<Element>();
  let truncated = false;

  const all = Array.from(document.querySelectorAll("body *"));
  for (const el of all) {
    if (el.closest("#" + recorderHostId) !== null) {
      continue;
    }
    if (!isActionable(el)) {
      continue;
    }
    if (seen.has(el)) {
      continue;
    }
    seen.add(el);
    if (elements.length >= maxElements) {
      truncated = true;
      break;
    }

    // A pointer-events:none control can never itself receive a click, and a 1x1px control (the sr-only
    // visually-hidden-input pattern) can technically receive one but not reliably — either way any
    // candidate resolving to it is guaranteed to hang or flake at act/playback time. Reported role/name/
    // tag stay this element's own; the candidates (and therefore `chosen`) are built from the real click
    // delegate instead. No delegate found means no candidates at all — never fall back to el's own
    // (broken) candidates here.
    let candidates: SelectorCandidatePayload[];
    let clickDelegate = false;
    if (isPointerEventsNone(el) || isEffectivelyZeroSize(el)) {
      const delegate = findClickDelegateAncestor(el);
      candidates = delegate !== undefined ? buildCandidates(delegate) : [];
      clickDelegate = candidates.length > 0;
    } else {
      candidates = buildCandidates(el);
    }
    const htmlInput = el as HTMLInputElement;
    const value = inputValue(el);
    elements.push({
      ref: stableRefFor(el),
      role: implicitRole(el),
      name: getAccessibleName(el),
      tag: el.tagName.toLowerCase(),
      ...(value !== undefined ? { value } : {}),
      ...(htmlInput.disabled === true ? { disabled: true } : {}),
      ...(el.getAttribute("aria-invalid") === "true" ? { aria_invalid: true } : {}),
      ...(el.getAttribute("aria-required") === "true" ? { aria_required: true } : {}),
      ...(clickDelegate ? { click_delegate: true } : {}),
      candidates,
      chosen: chooseBestCandidate(candidates),
      element: buildElementMeta(el)
    });
  }

  return {
    url: window.location.href,
    title: document.title,
    alerts: captureAlerts(),
    truncated,
    elements
  };
}

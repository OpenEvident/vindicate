/** Mirrors interactive-capture.evaluate.ts isInteractive — kept in sync for recording click resolution. */

const INTERACTIVE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "option",
  "summary"
]);

const INTERACTIVE_ROLES = new Set([
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
]);

export function findTestidOnElement(
  el: Element,
  candidates: readonly string[]
): { value: string; attr: string } | null {
  for (const attr of candidates) {
    const val = el.getAttribute(attr);
    if (val !== null && val.length > 0) {
      return { value: val, attr };
    }
  }
  return null;
}

export function isInteractiveElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) {
    return true;
  }
  const role = el.getAttribute("role");
  if (role !== null && INTERACTIVE_ROLES.has(role)) {
    return true;
  }
  if (el.hasAttribute("onclick")) {
    return true;
  }
  if (el.getAttribute("tabindex") === "0") {
    return true;
  }
  return false;
}

export function isActionableElement(el: Element, testidCandidates: readonly string[]): boolean {
  return isInteractiveElement(el) || findTestidOnElement(el, testidCandidates) !== null;
}

function isPointerEventsNone(el: Element): boolean {
  try {
    return window.getComputedStyle(el).pointerEvents === "none";
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

/**
 * Walk up from the click target to the nearest element automation would act on. A real DOM click event's
 * target is already hit-test-correct (the browser skips a `pointer-events: none` element entirely when
 * deciding what receives the click) — but a wrapper div with only a framework click binding and a
 * `cursor: pointer` affordance carries none of the tag/role/tabindex/onclick-attribute signals
 * `isActionableElement` looks for, so without this fallback the walk finds nothing and the click is
 * silently dropped instead of recorded. Only used when the primary walk finds no real match at all, so
 * it never overrides a more specific actionable element found closer to the click target.
 */
export function resolveActionableElement(
  el: Element | null,
  testidCandidates: readonly string[]
): Element | null {
  let cur = el;
  let cursorFallback: Element | null = null;
  while (cur !== null && cur.nodeType === Node.ELEMENT_NODE) {
    if (isActionableElement(cur, testidCandidates)) {
      return cur;
    }
    if (cursorFallback === null && !isPointerEventsNone(cur) && hasClickCursor(cur)) {
      cursorFallback = cur;
    }
    cur = cur.parentElement;
  }
  return cursorFallback;
}

/** Injected into the browser recorder script — must stay aligned with the functions above. */
export function recordingActionableBrowserScript(): string {
  return `
  function isInteractive(el) {
    const tag = el.tagName.toLowerCase();
    if (['button','a','input','select','textarea','option','summary'].indexOf(tag) >= 0) return true;
    const role = el.getAttribute('role');
    if (role !== null && ['button','link','textbox','checkbox','radio','tab','menuitem','option','combobox','listbox','slider','spinbutton','switch','menuitemcheckbox','menuitemradio'].indexOf(role) >= 0) return true;
    if (el.hasAttribute('onclick')) return true;
    if (el.getAttribute('tabindex') === '0') return true;
    return false;
  }

  function isActionable(el) {
    return isInteractive(el) || findTestid(el, TESTID_CANDIDATES) !== null;
  }

  function isPointerEventsNoneForActionable(el) {
    try { return window.getComputedStyle(el).pointerEvents === 'none'; } catch (e) { return false; }
  }

  function hasClickCursorForActionable(el) {
    try { return window.getComputedStyle(el).cursor === 'pointer'; } catch (e) { return false; }
  }

  // parity: recording-actionable.ts resolveActionableElement — cursor:pointer fallback only used when
  // the primary tag/role/tabindex/onclick-attribute walk finds nothing at all, so a click on a
  // pointer-events:none-blocked control's cursor:pointer wrapper (e.g. a custom multi-select row) is
  // recorded against the real click delegate instead of silently dropped.
  function resolveActionableElement(el) {
    let cur = el;
    let cursorFallback = null;
    while (cur !== null && cur.nodeType === Node.ELEMENT_NODE) {
      if (isActionable(cur)) return cur;
      if (cursorFallback === null && !isPointerEventsNoneForActionable(cur) && hasClickCursorForActionable(cur)) {
        cursorFallback = cur;
      }
      cur = cur.parentElement;
    }
    return cursorFallback;
  }
  `;
}

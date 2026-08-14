/** Shared selector-candidate ranking (mirrored in browser evaluate strings — keep in sync). */
export interface SelectorCandidateLike {
  strategy: string;
  value: string;
  attr?: string;
  strength?: "strong" | "medium" | "weak";
  dynamic?: boolean;
  container?: { role: string; name: string };
}

const STRATEGY_ORDER = [
  "testid",
  "scoped",
  "dom_id",
  "role_name",
  "text",
  "attr_combo",
  "sibling_text",
  "nth"
] as const;

export function chooseBestSelectorCandidate(
  candidates: ReadonlyArray<SelectorCandidateLike>
): SelectorCandidateLike | null {
  const nonDynamic = candidates.filter((c) => c.dynamic !== true);
  const pool = nonDynamic.length > 0 ? nonDynamic : [...candidates];
  for (const strategy of STRATEGY_ORDER) {
    const hit = pool.find((c) => c.strategy === strategy);
    if (hit !== undefined) {
      return hit;
    }
  }
  return pool[0] ?? null;
}

/** Mirrors snapshot/ref-generator.ts — parity for in-page recorder strings. */
export function isGeneratedDomId(id: string): boolean {
  return (
    /^[a-z]+-[0-9a-f]{6,}$/i.test(id) ||
    /^\d+$/.test(id) ||
    // React useId() is colon-wrapped on both ends (":r0:"), optionally behind a library prefix
    // (Radix's identifierPrefix gives "radix-:r0:") — see ref-generator.ts for the live-confirmed bug.
    /^[a-z0-9_]*-?:[a-z0-9]+:$/i.test(id) ||
    /^sc-[A-Za-z]/.test(id)
  );
}

export function findRepeatingContainer(el: Element): Element | null {
  let current: Element | null = el.parentElement;
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
        const row = current.closest("[role=row], tr");
        return row ?? current;
      }
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * ARIA implicit role for an element with no explicit `role` attribute — NOT the tag name itself.
 * `<tr>`'s implicit role is "row", not "tr"; `getByRole('tr', ...)` matches nothing in a real browser,
 * since Playwright resolves against the computed accessibility tree, not raw tag names. Mirrors
 * `interactive-capture.evaluate.ts`'s `implicitRole`, plus the container-row mappings this file's own
 * `findRepeatingContainer` needs (`tr`→row, `li`→listitem, `td`→gridcell).
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

export function buildScopedCandidate(
  el: Element,
  getAccessibleName: (node: Element) => string
): SelectorCandidateLike | null {
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

/** XPath string-literal, quote-safe (mirrors `interactive-capture.evaluate.ts`'s `xpathLiteral`). */
function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const segs = s.split('"');
  return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
}

/**
 * Last resort for a control with no accessible name at all (broken/unlabeled markup): if exactly one
 * non-interactive sibling carries text, that's an unambiguous, human-readable identifier even though it
 * isn't ARIA-associated. Mirrors `interactive-capture.evaluate.ts`'s `findSiblingTextMatch` — same 1:1
 * requirement (zero or multiple candidates yield nothing, never a guess). `value` is a real resolvable
 * XPath (this data model has no separate `xpath` field, unlike `StructuredLocator`) so playback
 * (`recording-playback.service.ts`) can render it the same way as `attr_combo`/`nth`. Unlike the
 * capture-time version, this one does not self-verify XPath uniqueness (this file has no live-page
 * uniqueness check for any of its candidates, `scoped` included) — a human already drove the exact click
 * this candidate describes, so the risk profile is lower than the agent-driven, act-by-ref capture path.
 */
export function buildSiblingTextCandidate(
  el: Element,
  getAccessibleName: (node: Element) => string,
  isInteractiveNode: (node: Element) => boolean
): SelectorCandidateLike | null {
  const parent = el.parentElement;
  if (parent === null) {
    return null;
  }
  const candidates: string[] = [];
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el || isInteractiveNode(sibling)) {
      continue;
    }
    const text = getAccessibleName(sibling);
    if (text.length > 0) {
      candidates.push(text);
    }
  }
  if (candidates.length !== 1) {
    return null;
  }
  const text = candidates[0];
  if (text === undefined) {
    return null;
  }
  const tag = el.tagName.toLowerCase();
  const lit = xpathLiteral(text);
  return {
    strategy: "sibling_text",
    value: `//${tag}[preceding-sibling::*[normalize-space()=${lit}] or following-sibling::*[normalize-space()=${lit}]]`,
    strength: "medium"
  };
}

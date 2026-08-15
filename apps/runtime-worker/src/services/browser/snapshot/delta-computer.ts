/**
 * @file Pure delta between two ref maps (BROWSER-SERVICE §1.9).
 */
export type DeltaComparableField =
  | "name"
  | "value"
  | "disabled"
  | "aria_invalid"
  | "aria_busy"
  | "aria_expanded"
  | "aria_checked"
  | "aria_selected"
  | "aria_required"
  | "aria_pressed"
  | "aria_haspopup";

export interface RefSnapshotForDelta {
  readonly name: string;
  readonly value?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly aria_invalid?: boolean | null | undefined;
  readonly aria_busy?: boolean | null | undefined;
  readonly aria_expanded?: boolean | null | undefined;
  readonly aria_checked?: boolean | "mixed" | null | undefined;
  readonly aria_selected?: boolean | null | undefined;
  readonly aria_required?: boolean | null | undefined;
  readonly aria_pressed?: boolean | "mixed" | null | undefined;
  readonly aria_haspopup?: boolean | null | undefined;
}

export interface ChangeDetail {
  readonly ref: string;
  readonly changes: ReadonlyArray<{
    readonly field: DeltaComparableField;
    readonly before: string;
    readonly after: string;
  }>;
}

function serializeAria(value: boolean | "mixed" | null | undefined): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (value === "mixed") {
    return "mixed";
  }
  return value ? "true" : "false";
}

function serializeBool(value: boolean | undefined): string {
  if (value === undefined) {
    return "null";
  }
  return value ? "true" : "false";
}

function pushIfChanged(
  changes: Array<{ field: DeltaComparableField; before: string; after: string }>,
  field: DeltaComparableField,
  before: string,
  after: string
): void {
  if (before !== after) {
    changes.push({ field, before, after });
  }
}

export function computeDelta(
  previous: Readonly<Record<string, RefSnapshotForDelta>>,
  current: Readonly<Record<string, RefSnapshotForDelta>>
): { added: string[]; removed: string[]; changed: ChangeDetail[] } {
  const prevRefs = new Set(Object.keys(previous));
  const curRefs = new Set(Object.keys(current));
  const added = [...curRefs].filter((r) => !prevRefs.has(r)).sort();
  const removed = [...prevRefs].filter((r) => !curRefs.has(r)).sort();
  const changed: ChangeDetail[] = [];

  for (const ref of curRefs) {
    if (!prevRefs.has(ref)) {
      continue;
    }
    const p = previous[ref];
    const c = current[ref];
    if (p === undefined || c === undefined) {
      continue;
    }
    const row: Array<{ field: DeltaComparableField; before: string; after: string }> = [];
    pushIfChanged(row, "name", p.name, c.name);
    pushIfChanged(row, "value", p.value ?? "null", c.value ?? "null");
    pushIfChanged(row, "disabled", serializeBool(p.disabled), serializeBool(c.disabled));
    pushIfChanged(
      row,
      "aria_invalid",
      serializeAria(p.aria_invalid),
      serializeAria(c.aria_invalid)
    );
    pushIfChanged(row, "aria_busy", serializeAria(p.aria_busy), serializeAria(c.aria_busy));
    pushIfChanged(
      row,
      "aria_expanded",
      serializeAria(p.aria_expanded),
      serializeAria(c.aria_expanded)
    );
    pushIfChanged(
      row,
      "aria_checked",
      serializeAria(p.aria_checked),
      serializeAria(c.aria_checked)
    );
    pushIfChanged(
      row,
      "aria_selected",
      serializeAria(p.aria_selected),
      serializeAria(c.aria_selected)
    );
    pushIfChanged(
      row,
      "aria_required",
      serializeAria(p.aria_required),
      serializeAria(c.aria_required)
    );
    pushIfChanged(
      row,
      "aria_pressed",
      serializeAria(p.aria_pressed),
      serializeAria(c.aria_pressed)
    );
    pushIfChanged(
      row,
      "aria_haspopup",
      serializeAria(p.aria_haspopup),
      serializeAria(c.aria_haspopup)
    );
    if (row.length > 0) {
      changed.push({ ref, changes: row });
    }
  }

  return { added, removed, changed };
}

/**
 * When a role+name pair that already existed in the previous snapshot also has exactly one
 * NEWLY-added element (a different ref — e.g. a different `frame_path`) in the current one, the new
 * element is very likely a live replacement for the old one, not an unrelated coincidence. Confirmed
 * live: a Klarna/Stripe checkout mounts a fresh "Secure payment input frame" iframe once "Credit or
 * debit card" is selected, leaving the pre-selection instance briefly still attached — same role and
 * name, indistinguishable by any static signal, only `computeDelta`'s own `added` list tells them
 * apart (the new one wasn't there a moment ago; the old one was). Deliberately conservative: a
 * role+name group with more than one newly-added candidate, or with zero older instances, is left
 * unmarked rather than guessed at — this only fires for the unambiguous one-new-replaces-one-or-more-
 * old case.
 */
export function computeSupersedes(
  elements: ReadonlyArray<{ readonly ref: string; readonly role: string; readonly name: string }>,
  added: readonly string[]
): ReadonlyMap<string, string> {
  const addedSet = new Set(added);
  const byShape = new Map<string, Array<{ readonly ref: string }>>();
  for (const el of elements) {
    if (el.name.length === 0) {
      // Empty-name groups (generic containers, decorative elements) are too noisy to be a
      // meaningful "same logical control" signal — restrict to elements with a real accessible name.
      continue;
    }
    const key = `${el.role} ${el.name}`;
    const list = byShape.get(key) ?? [];
    list.push(el);
    byShape.set(key, list);
  }

  const result = new Map<string, string>();
  for (const group of byShape.values()) {
    if (group.length < 2) {
      continue;
    }
    const newOnes = group.filter((e) => addedSet.has(e.ref));
    const oldOnes = group.filter((e) => !addedSet.has(e.ref));
    if (newOnes.length === 1 && oldOnes.length >= 1) {
      result.set(newOnes[0]!.ref, oldOnes[0]!.ref);
    }
  }
  return result;
}

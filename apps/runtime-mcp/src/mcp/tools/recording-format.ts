/**
 * Compact markdown projection of a recording artifact for AI consumption.
 * No @refs — recording snapshots are historical; browser_act needs live browser_read refs.
 */
import type {
  RecordingArtifact,
  RecordingPageSnapshot,
  RecordedStep,
  SelectorCandidate
} from "@vindicate/protocol";

interface RefSnapshotForDelta {
  readonly name: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly aria_invalid?: boolean | null;
  readonly aria_required?: boolean | null;
  readonly aria_expanded?: boolean | null;
  readonly aria_checked?: boolean | "mixed" | null;
}

interface SnapshotCheckpoint {
  readonly id: string;
  readonly header: string;
  readonly snapshot: RecordingPageSnapshot;
}

function computeDelta(
  previous: Readonly<Record<string, RefSnapshotForDelta>>,
  current: Readonly<Record<string, RefSnapshotForDelta>>
): {
  added: string[];
  removed: string[];
  changed: Array<{ ref: string; changes: Array<{ field: string; before: string; after: string }> }>;
} {
  const prevRefs = new Set(Object.keys(previous));
  const curRefs = new Set(Object.keys(current));
  const added = [...curRefs].filter((r) => !prevRefs.has(r)).sort();
  const removed = [...prevRefs].filter((r) => !curRefs.has(r)).sort();
  const changed: Array<{
    ref: string;
    changes: Array<{ field: string; before: string; after: string }>;
  }> = [];

  for (const ref of curRefs) {
    if (!prevRefs.has(ref)) {
      continue;
    }
    const p = previous[ref]!;
    const c = current[ref]!;
    const row: Array<{ field: string; before: string; after: string }> = [];
    if (p.name !== c.name) {
      row.push({ field: "name", before: p.name, after: c.name });
    }
    if ((p.value ?? "null") !== (c.value ?? "null")) {
      row.push({ field: "value", before: p.value ?? "null", after: c.value ?? "null" });
    }
    if (String(p.disabled ?? "null") !== String(c.disabled ?? "null")) {
      row.push({
        field: "disabled",
        before: String(p.disabled ?? "null"),
        after: String(c.disabled ?? "null")
      });
    }
    if (String(p.aria_invalid ?? "null") !== String(c.aria_invalid ?? "null")) {
      row.push({
        field: "aria_invalid",
        before: String(p.aria_invalid ?? "null"),
        after: String(c.aria_invalid ?? "null")
      });
    }
    if (String(p.aria_required ?? "null") !== String(c.aria_required ?? "null")) {
      row.push({
        field: "aria_required",
        before: String(p.aria_required ?? "null"),
        after: String(c.aria_required ?? "null")
      });
    }
    if (String(p.aria_expanded ?? "null") !== String(c.aria_expanded ?? "null")) {
      row.push({
        field: "aria_expanded",
        before: String(p.aria_expanded ?? "null"),
        after: String(c.aria_expanded ?? "null")
      });
    }
    if (String(p.aria_checked ?? "null") !== String(c.aria_checked ?? "null")) {
      row.push({
        field: "aria_checked",
        before: String(c.aria_checked ?? "null"),
        after: String(c.aria_checked ?? "null")
      });
    }
    if (row.length > 0) {
      changed.push({ ref, changes: row });
    }
  }

  return { added, removed, changed };
}

export function formatChosenLocator(chosen: SelectorCandidate | null | undefined): string {
  if (chosen === null || chosen === undefined) {
    return "";
  }
  if (chosen.strategy === "testid") {
    return `[${chosen.attr ?? "testid"}=${chosen.value}]`;
  }
  if (chosen.strategy === "role_name" || chosen.strategy === "role+name") {
    return chosen.value;
  }
  if (
    chosen.strategy === "label" ||
    chosen.strategy === "placeholder" ||
    chosen.strategy === "text"
  ) {
    return `${chosen.strategy}: ${chosen.value}`;
  }
  if (
    chosen.strategy === "testid_xpath" ||
    chosen.strategy === "dom_id" ||
    chosen.strategy === "attr_combo" ||
    chosen.strategy === "sibling_text" ||
    chosen.strategy === "nth" ||
    chosen.strategy === "xpath" ||
    chosen.strategy === "css"
  ) {
    const v = chosen.value.length > 80 ? `${chosen.value.slice(0, 77)}...` : chosen.value;
    return v;
  }
  if (chosen.strategy === "scoped") {
    const container = chosen.container?.name ?? "row";
    return `row "${container}" → ${chosen.value}`;
  }
  return chosen.value;
}

function formatFlags(el: {
  disabled?: boolean | undefined;
  aria_invalid?: boolean | null | undefined;
  aria_required?: boolean | null | undefined;
  aria_expanded?: boolean | null | undefined;
  aria_checked?: boolean | "mixed" | null | undefined;
}): string {
  const flags: string[] = [];
  if (el.aria_required === true) {
    flags.push("required");
  }
  if (el.aria_expanded === true) {
    flags.push("expanded");
  }
  if (el.aria_checked === true) {
    flags.push("checked");
  }
  if (el.aria_checked === "mixed") {
    flags.push("mixed");
  }
  if (el.disabled === true) {
    flags.push("disabled");
  }
  if (el.aria_invalid === true) {
    flags.push("invalid");
  }
  return flags.length > 0 ? ` [${flags.join(", ")}]` : "";
}

function maskValue(value: string, step: RecordedStep): string {
  if (step.env_var === true) {
    return "(***)";
  }
  const tag = step.element?.tag?.toLowerCase();
  const name = (step.element?.name ?? step.text ?? "").toLowerCase();
  if (tag === "input" && step.text !== undefined) {
    const isPassword =
      name.includes("password") ||
      step.chosen?.value.toLowerCase().includes("password") ||
      step.candidates?.some((c) => c.value.toLowerCase().includes("password"));
    if (isPassword) {
      return "(***)";
    }
  }
  return value;
}

function inferImplicitTriggerSeq(step: RecordedStep, allSteps: readonly RecordedStep[]): number {
  for (let i = allSteps.length - 1; i >= 0; i--) {
    const candidate = allSteps[i]!;
    if (candidate.seq >= step.seq) {
      continue;
    }
    if (candidate.action === "snapshot" || candidate.action === "navigate") {
      continue;
    }
    return candidate.seq;
  }
  return Math.max(1, step.seq - 1);
}

function formatFlowStep(
  step: RecordedStep,
  snapshotIndexBySeq: ReadonlyMap<number, string>,
  allSteps: readonly RecordedStep[]
): string {
  const n = String(step.seq).padEnd(2, " ");
  const action = step.action.padEnd(9, " ");
  const locator = formatChosenLocator(step.chosen);
  const dynamicHint =
    step.chosen?.dynamic === true ? " ⚠ looks auto-generated — prefer data-testid/role+name" : "";
  const delegateHint =
    step.chosen?.click_delegate === true
      ? " (click-delegate ancestor — click only, no check/uncheck)"
      : "";
  const locatorSuffix = locator.length > 0 ? ` ${locator}${dynamicHint}${delegateHint}` : "";

  if (step.action === "snapshot") {
    const snapId = snapshotIndexBySeq.get(step.seq);
    return `${n} snapshot  → ${snapId ?? "snap"}`;
  }
  if (step.action === "navigate") {
    if (step.navigation_trigger === "implicit") {
      const prevSeq = inferImplicitTriggerSeq(step, allSteps);
      return `${n} ↪ navigated to ${step.url ?? ""} (auto — result of step ${prevSeq}, not a separate step)`;
    }
    return `${n} navigate  ${step.url ?? ""}`;
  }
  if (step.action === "press_key") {
    const target =
      step.element?.name !== undefined && step.element.name.length > 0
        ? ` on "${step.element.name}"`
        : "";
    return `${n} press_key ${step.key ?? ""}${target}${locatorSuffix}`;
  }
  if (step.action === "fill" || step.action === "select") {
    const label = step.element?.name ?? step.element?.tag ?? "field";
    const raw = step.text ?? "";
    const masked = raw.length > 0 ? maskValue(raw, step) : "";
    const envNote = step.env_var === true ? " (env var candidate)" : "";
    const value = raw.length > 0 ? ` (${masked}${envNote})` : "";
    return `${n} ${action} "${label}"${value}${locatorSuffix}`;
  }
  if (step.action === "drag") {
    const source = step.element?.name?.trim() || step.element?.tag || "source";
    const target = step.target?.element?.name?.trim() || step.target?.element?.tag || "target";
    return `${n} drag      ${source} → ${target}${locatorSuffix}`;
  }
  if (step.action === "upload_file" && step.files !== undefined && step.files.length > 0) {
    return `${n} upload    ${step.files.join(", ")}${locatorSuffix}`;
  }

  const label = step.element?.name?.trim();
  const target =
    label !== undefined && label.length > 0 ? `"${label}"` : (step.element?.tag ?? "element");
  return `${n} ${action} ${target}${locatorSuffix}`;
}

function elementIdentity(el: RecordingPageSnapshot["elements"][number]): string {
  const locator = formatChosenLocator(el.chosen);
  const locatorPart = locator.length > 0 ? ` ${locator}` : "";
  const name = el.name.length > 0 ? `"${el.name}"` : '""';
  return `${el.role} ${name}${locatorPart}`;
}

function formatSnapshotElementLine(el: RecordingPageSnapshot["elements"][number]): string {
  const valueBadge = el.value !== undefined && el.value.length > 0 ? ` (${el.value})` : "";
  return `- ${elementIdentity(el)}${valueBadge}${formatFlags(el)}`;
}

function buildRefMap(snapshot: RecordingPageSnapshot): Record<string, RefSnapshotForDelta> {
  const map: Record<string, RefSnapshotForDelta> = {};
  for (const el of snapshot.elements) {
    map[el.ref] = {
      name: el.name,
      ...(el.value !== undefined ? { value: el.value } : {}),
      ...(el.disabled !== undefined ? { disabled: el.disabled } : {}),
      ...(el.aria_invalid !== undefined ? { aria_invalid: el.aria_invalid } : {}),
      ...(el.aria_required !== undefined ? { aria_required: el.aria_required } : {})
    };
  }
  return map;
}

function elementByRef(
  snapshot: RecordingPageSnapshot,
  ref: string
): RecordingPageSnapshot["elements"][number] | undefined {
  return snapshot.elements.find((el) => el.ref === ref);
}

function formatAlerts(alerts: string[] | undefined): string[] {
  if (alerts === undefined || alerts.length === 0) {
    return [];
  }
  return [`⚠️ ${alerts.length} alert(s): ${alerts.map((a) => `"${a}"`).join(", ")}`];
}

function formatFullSnapshotBody(snapshot: RecordingPageSnapshot): string[] {
  const lines: string[] = [`page: ${snapshot.title} — ${snapshot.url}`];
  if (snapshot.truncated === true) {
    lines.push("⚠️ Snapshot truncated — artifact may omit elements");
  }
  for (const el of snapshot.elements) {
    lines.push(formatSnapshotElementLine(el));
  }
  lines.push(...formatAlerts(snapshot.alerts));
  return lines;
}

function formatDeltaSnapshotBody(
  current: RecordingPageSnapshot,
  previous: RecordingPageSnapshot
): string[] {
  if (previous.url !== current.url) {
    const lines = formatFullSnapshotBody(current);
    lines.splice(1, 0, "(full — page navigated)");
    return lines;
  }

  const prevMap = buildRefMap(previous);
  const curMap = buildRefMap(current);
  const delta = computeDelta(prevMap, curMap);
  const lines: string[] = [];

  if (delta.added.length === 0 && delta.removed.length === 0 && delta.changed.length === 0) {
    lines.push("(no element changes)");
  }

  for (const ref of delta.added) {
    const el = elementByRef(current, ref);
    if (el !== undefined) {
      lines.push(`+ ${formatSnapshotElementLine(el).slice(2)}`);
    }
  }
  for (const ref of delta.removed) {
    const el = elementByRef(previous, ref);
    if (el !== undefined) {
      lines.push(`- ${elementIdentity(el)}`);
    }
  }
  for (const change of delta.changed) {
    const el = elementByRef(current, change.ref) ?? elementByRef(previous, change.ref);
    const label = el !== undefined ? elementIdentity(el) : change.ref;
    for (const row of change.changes) {
      lines.push(`~ ${label}  ${row.field}: ${row.before} → ${row.after}`);
    }
  }

  lines.push(...formatAlerts(current.alerts));
  return lines;
}

function buildSnapshotCheckpoints(artifact: RecordingArtifact): SnapshotCheckpoint[] {
  const checkpoints: SnapshotCheckpoint[] = [];
  let snapNum = 0;

  for (const step of artifact.steps) {
    if (step.page_snapshot === undefined) {
      continue;
    }
    snapNum += 1;
    checkpoints.push({
      id: `snap-${snapNum}`,
      header: `step ${step.seq} · ${step.page_snapshot.title}`,
      snapshot: step.page_snapshot
    });
  }

  if (artifact.final_snapshot !== undefined) {
    checkpoints.push({
      id: "snap-final",
      header: `stop · ${artifact.final_snapshot.title}`,
      snapshot: artifact.final_snapshot
    });
  }

  return checkpoints;
}

export function formatRecordingForAi(artifact: RecordingArtifact): string {
  const checkpoints = buildSnapshotCheckpoints(artifact);
  const snapshotIndexBySeq = new Map<number, string>();
  let snapNum = 0;
  for (const step of artifact.steps) {
    if (step.page_snapshot !== undefined) {
      snapNum += 1;
      snapshotIndexBySeq.set(step.seq, `snap-${snapNum}`);
    }
  }

  const lines: string[] = [
    `recording: ${artifact.name}`,
    `recorded: ${artifact.recorded_at}`,
    `steps: ${artifact.steps.length} · snapshots: ${checkpoints.length}`,
    "",
    "── flow ──",
    ...artifact.steps.map((step) => formatFlowStep(step, snapshotIndexBySeq, artifact.steps)),
    "── end flow ──",
    "",
    "Note: locators below are from the human recording — call browser_read before browser_act on a live session.",
    ""
  ];

  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i]!;
    const prevCheckpoint = i > 0 ? checkpoints[i - 1] : undefined;
    const deltaLabel = prevCheckpoint !== undefined ? ` (delta from ${prevCheckpoint.id})` : "";

    lines.push(`── ${checkpoint.id} · ${checkpoint.header}${deltaLabel} ──`);
    const body =
      prevCheckpoint === undefined
        ? formatFullSnapshotBody(checkpoint.snapshot)
        : formatDeltaSnapshotBody(checkpoint.snapshot, prevCheckpoint.snapshot);
    lines.push(...body);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

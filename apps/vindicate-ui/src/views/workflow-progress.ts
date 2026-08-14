/** In-chat workflow progress panel (phase checklist). */
const EXTRA_LABELS: Record<string, string> = {
  understand: "Understand requirements",
  ground: "Ground locators",
  design: "Design tests",
  generate: "Generate code",
  execute: "Run tests",
  heal: "Fix failures",
  audit: "Quality check",
  coverage: "Coverage analysis",
  scaffold: "Scaffold project",
  install: "Install dependencies",
  "ci-setup": "CI setup",
  smoke: "Smoke test",
  escalate: "Escalate"
};

function displayLabel(phaseKey: string, explicit?: string): string {
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }
  return EXTRA_LABELS[phaseKey] ?? phaseKey.replace(/_/g, " ");
}

function renderNeedsClarification(root: HTMLElement, data: Record<string, unknown>): void {
  const message =
    typeof data.message === "string" && data.message.length > 0
      ? data.message
      : "What would you like to do?";

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Vindicate";
  const badge = document.createElement("span");
  badge.className = "panel-phase";
  badge.textContent = "Needs input";
  header.append(logo, title, badge);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const card = document.createElement("div");
  card.className = "design-box";
  card.style.cssText = "display:flex;align-items:flex-start;gap:10px;";

  const icon = document.createElement("span");
  icon.textContent = "?";
  icon.style.cssText =
    "flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;" +
    "display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-top:1px;";

  const text = document.createElement("span");
  text.textContent = message;
  text.style.cssText = "font-size:13px;line-height:1.55;color:var(--text);";

  card.append(icon, text);
  body.appendChild(card);
  root.appendChild(body);
}

export function renderWorkflowProgress(root: HTMLElement, data: Record<string, unknown>): void {
  if (data.status === "needs_clarification") {
    renderNeedsClarification(root, data);
    return;
  }

  const phaseKey = String(data.phase ?? "");
  const isOrient = data.status === "orient";
  const isTerminal = data.terminal === true;
  const phaseLabel =
    typeof data.phase_label === "string" && data.phase_label.length > 0
      ? data.phase_label
      : displayLabel(phaseKey, "Ready");
  const phases =
    (data.phases as Array<{ id?: string; label?: string; status: string }> | undefined) ?? [];

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Vindicate";
  const phaseBadge = document.createElement("span");
  phaseBadge.className = "panel-phase";
  if (isTerminal) {
    phaseBadge.classList.add("panel-phase-done");
    phaseBadge.textContent = "Done";
  } else if (phaseKey.length > 0) {
    phaseBadge.textContent = displayLabel(phaseKey, phaseLabel);
  } else {
    phaseBadge.textContent = "Start";
  }
  header.append(logo, title, phaseBadge);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const h2 = document.createElement("h2");
  h2.className = "panel-section-title";
  h2.textContent = isTerminal ? "Complete" : "In progress";
  body.appendChild(h2);

  if (isOrient) {
    const card = document.createElement("div");
    card.className = "design-box";
    card.style.cssText = "display:flex;align-items:flex-start;gap:10px;";

    const icon = document.createElement("span");
    icon.textContent = "▶";
    icon.style.cssText =
      "flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;" +
      "display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:1px;";

    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;";
    title.textContent = "Starting workflow";
    const sub = document.createElement("div");
    sub.style.cssText = "font-size:12.5px;line-height:1.55;color:var(--text-secondary);";
    sub.textContent = "Preparing the next phase and progress tracking.";
    textWrap.append(title, sub);

    card.append(icon, textWrap);
    body.appendChild(card);
  } else if (isTerminal) {
    const doneCount = phases.filter((p) => p.status === "done").length;
    const doneBanner = document.createElement("div");
    doneBanner.className = "done-banner";
    const doneIcon = document.createElement("div");
    doneIcon.className = "done-icon";
    doneIcon.textContent = "✓";
    const doneBody = document.createElement("div");
    const doneTitle = document.createElement("div");
    doneTitle.className = "done-title";
    doneTitle.textContent = "Workflow complete";
    const doneSub = document.createElement("div");
    doneSub.className = "done-sub";
    doneSub.textContent =
      phases.length > 0
        ? `${doneCount}/${phases.length} phases finished. Final summary is ready.`
        : "All phases finished. Final summary is ready.";
    doneBody.append(doneTitle, doneSub);
    doneBanner.append(doneIcon, doneBody);
    body.appendChild(doneBanner);
  } else if (phases.length > 0) {
    const list = document.createElement("div");
    list.className = "phase-list";
    phases.forEach((p, i) => {
      const cls =
        p.status === "done" ? "is-done" : p.status === "active" ? "is-active" : "is-pending";
      const row = document.createElement("div");
      row.className = `phase-row ${cls}`;
      const icon = document.createElement("div");
      icon.className = "phase-icon";
      icon.textContent = p.status === "done" ? "✓" : String(i + 1);
      const label = document.createElement("span");
      label.className = "phase-label";
      const rowLabel =
        typeof p.label === "string" && p.label.length > 0
          ? p.label
          : displayLabel(String(p.id ?? ""));
      label.textContent = rowLabel;
      row.appendChild(icon);
      row.appendChild(label);
      if (p.status === "active") {
        const dot = document.createElement("div");
        dot.className = "phase-running-dot";
        row.appendChild(dot);
      }
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  root.appendChild(body);
}

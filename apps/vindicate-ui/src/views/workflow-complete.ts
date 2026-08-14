function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderWorkflowComplete(root: HTMLElement, data: Record<string, unknown>): void {
  const verdict = String(data.verdict ?? "pass");
  const testsWritten = data.tests_written as number | undefined;
  const files = (data.files_touched as string[]) ?? [];
  const next = String(data.next_action ?? "");

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "V";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Complete";
  const phaseBadge = document.createElement("span");
  phaseBadge.className = "panel-phase panel-phase-done";
  phaseBadge.textContent = "Done";
  header.append(logo, title, phaseBadge);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const banner = document.createElement("div");
  banner.className = "done-banner";
  const icon = document.createElement("div");
  icon.className = "done-icon";
  icon.textContent = "✓";
  const textWrap = document.createElement("div");
  const doneTitle = document.createElement("div");
  doneTitle.className = "done-title";
  doneTitle.textContent = "Workflow complete";
  const sub = document.createElement("div");
  sub.className = "done-sub";
  sub.innerHTML = `Verdict: <strong>${escapeHtml(verdict)}</strong>`;
  textWrap.append(doneTitle, sub);
  banner.append(icon, textWrap);
  body.appendChild(banner);

  const tests = document.createElement("p");
  tests.innerHTML = `<strong>Tests written:</strong> ${testsWritten ?? "—"}`;
  body.appendChild(tests);

  if (files.length > 0) {
    const label = document.createElement("p");
    label.innerHTML = "<strong>Files touched:</strong>";
    body.appendChild(label);
    const ul = document.createElement("ul");
    for (const f of files) {
      const li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  if (next.length > 0) {
    const n = document.createElement("p");
    n.className = "panel-subtitle";
    n.innerHTML = `<strong>Next:</strong> ${escapeHtml(next)}`;
    body.appendChild(n);
  }

  root.appendChild(body);
}

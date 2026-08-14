type TestRow = {
  title: string;
  status: string;
  error?: string;
  durationMs?: number;
};

export function renderTestRunLive(root: HTMLElement, data: Record<string, unknown>): void {
  const tests = (data.tests as TestRow[] | undefined) ?? [];
  const running = data.running === true;

  const passed = Number(data.passed ?? tests.filter((t) => t.status === "passed").length);
  const failed = Number(data.failed ?? tests.filter((t) => t.status === "failed").length);
  const skipped = Number(data.skipped ?? tests.filter((t) => t.status === "skipped").length);

  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "panel-header";
  const outcome = data.outcome as string | undefined;
  const phaseLabel =
    running ? "Running" : outcome === "error" ? "Error" : outcome === "fail" ? "Failed" : "Complete";
  const phaseClass =
    running ? " panel-phase-running" : outcome === "fail" || outcome === "error" ? " panel-phase-fail" : "";
  header.innerHTML = `
    <div class="panel-logo">V</div>
    <span class="panel-title">Vindicate</span>
    <span class="panel-phase${phaseClass}">${phaseLabel}</span>
  `;
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const h2 = document.createElement("h2");
  h2.className = "panel-section-title";
  h2.textContent = "Test results";
  body.appendChild(h2);

  if (typeof data.summary === "string" && data.summary.length > 0) {
    const summaryLine = document.createElement("p");
    summaryLine.className = "panel-subtitle";
    summaryLine.textContent = data.summary;
    body.appendChild(summaryLine);
  }

  if (passed + failed + skipped > 0) {
    const grid = document.createElement("div");
    grid.className = "metric-grid";
    grid.innerHTML = `
      <div class="metric-card">
        <div class="metric-value" style="color:var(--success)">${passed}</div>
        <div class="metric-label">Passed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:var(--danger)">${failed}</div>
        <div class="metric-label">Failed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color:var(--text-muted)">${skipped}</div>
        <div class="metric-label">Skipped</div>
      </div>
    `;
    body.appendChild(grid);
  }

  if (typeof data.truncation_summary === "string") {
    const note = document.createElement("p");
    note.className = "panel-subtitle";
    note.textContent = data.truncation_summary;
    body.appendChild(note);
  }

  if (tests.length > 0) {
    const list = document.createElement("div");
    list.className = "test-result-list";
    for (const t of tests) {
      const row = document.createElement("div");
      row.className = "test-result-row";
      const statusClass =
        t.status === "passed" ? "badge-pass" : t.status === "failed" ? "badge-fail" : "badge-skip";
      const statusLabel =
        t.status === "passed" ? "Pass" : t.status === "failed" ? "Fail" : running ? "Running…" : "Skip";
      const title = document.createElement("div");
      title.className = "test-result-title";
      title.innerHTML = `<span>${escapeHtml(t.title)}</span><span class="badge ${statusClass}">${statusLabel}</span>`;
      row.appendChild(title);
      if (t.error !== undefined && t.error.length > 0) {
        const err = document.createElement("pre");
        err.className = "failure-error";
        err.textContent = t.error.split("\n").slice(0, 4).join("\n");
        row.appendChild(err);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  } else if (running) {
    const sub = document.createElement("p");
    sub.className = "panel-subtitle";
    sub.textContent = "Waiting for test results…";
    body.appendChild(sub);
  } else if (typeof data.raw_output === "string" && data.raw_output.length > 0) {
    const pre = document.createElement("pre");
    pre.className = "failure-error";
    pre.textContent = data.raw_output.slice(0, 1500);
    body.appendChild(pre);
  }

  root.appendChild(body);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

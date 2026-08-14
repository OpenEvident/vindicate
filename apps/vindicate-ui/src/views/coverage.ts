export function renderCoverage(root: HTMLElement, data: Record<string, unknown>): void {
  const total = data.total_tests as number | undefined;
  const suites = data.suite_count as number | undefined;
  const gaps = data.coverage_gaps as number | undefined;
  const features = (data.features as Array<{ name: string; status: string; test_count: number }>) ?? [];

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "V";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Coverage";
  header.appendChild(logo);
  header.appendChild(title);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const metrics = document.createElement("div");
  metrics.className = "metric-row";
  for (const [label, val] of [
    ["Tests", total],
    ["Suites", suites],
    ["Gaps", gaps]
  ] as const) {
    const card = document.createElement("div");
    card.className = "metric-card";
    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = val !== undefined ? String(val) : "—";
    const lbl = document.createElement("div");
    lbl.className = "metric-label";
    lbl.textContent = label;
    card.appendChild(value);
    card.appendChild(lbl);
    metrics.appendChild(card);
  }
  body.appendChild(metrics);

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Feature</th><th>Status</th><th>Tests</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const f of features) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${f.name}</td><td class="status-${f.status}">${f.status}</td><td>${f.test_count}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
  root.appendChild(body);
}

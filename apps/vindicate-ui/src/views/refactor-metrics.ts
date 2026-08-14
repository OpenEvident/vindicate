function displayMetric(value: unknown): string {
  return value === undefined ? "—" : String(value);
}

export function renderRefactorMetrics(root: HTMLElement, data: Record<string, unknown>): void {
  const cards = [
    ["Files changed", data.files_changed],
    ["Duplicates removed", data.duplication_removed],
    ["Lines saved", data.lines_saved],
    ["Tests (no change)", data.test_count]
  ] as const;

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "V";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Refactor";
  header.append(logo, title);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";
  const h2 = document.createElement("h2");
  h2.className = "panel-section-title";
  h2.textContent = "Refactor metrics";
  body.appendChild(h2);

  const grid = document.createElement("div");
  grid.className = "metric-grid";
  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.className = "metric-card";
    const val = document.createElement("div");
    val.className = "metric-value";
    val.textContent = displayMetric(value);
    const lbl = document.createElement("div");
    lbl.className = "metric-label";
    lbl.textContent = label;
    card.append(val, lbl);
    grid.appendChild(card);
  }
  body.appendChild(grid);
  root.appendChild(body);
}

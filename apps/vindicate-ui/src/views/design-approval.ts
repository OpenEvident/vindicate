type Suite = { title: string; cases: Array<{ title: string }> };
type Badge = "added" | "modified" | "removed";

export function renderDesignApproval(root: HTMLElement, data: Record<string, unknown>): void {
  const writePlan = String(data.write_plan ?? "");
  const suites = (data.suites as Suite[]) ?? [];
  const badges = (data.badges as Record<string, Badge>) ?? {};

  const header = document.createElement("div");
  header.className = "panel-header";
  const logo = document.createElement("div");
  logo.className = "panel-logo";
  logo.textContent = "V";
  const title = document.createElement("span");
  title.className = "panel-title";
  title.textContent = "Vindicate";
  const phaseBadge = document.createElement("span");
  phaseBadge.className = "panel-phase";
  phaseBadge.textContent = "Design review";
  header.append(logo, title, phaseBadge);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body";

  const hint = document.createElement("p");
  hint.className = "panel-subtitle";
  hint.textContent = "Read-only preview. Approve or edit the design in chat with the agent.";
  body.appendChild(hint);

  if (writePlan) {
    const plan = document.createElement("p");
    plan.className = "panel-subtitle";
    plan.textContent = writePlan;
    body.appendChild(plan);
  }

  for (const suite of suites) {
    const suiteBlock = document.createElement("div");
    suiteBlock.className = "suite-block";
    const h3 = document.createElement("h3");
    h3.textContent = suite.title;
    suiteBlock.appendChild(h3);

    for (const c of suite.cases) {
      const row = document.createElement("div");
      row.className = "case-row";
      const badge = badges[c.title];
      const badgeText =
        badge === "added" ? "✅" : badge === "modified" ? "✏️" : badge === "removed" ? "🗑️" : "";
      const label = document.createElement("span");
      label.textContent = `${badgeText} ${c.title}`.trim();
      row.appendChild(label);
      suiteBlock.appendChild(row);
    }
    body.appendChild(suiteBlock);
  }

  root.appendChild(body);
}

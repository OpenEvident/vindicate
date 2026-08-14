import type { App } from "@modelcontextprotocol/ext-apps";

import { renderCoverage } from "./coverage.js";
import { renderDesignApproval } from "./design-approval.js";
import { renderRefactorMetrics } from "./refactor-metrics.js";
import { renderTestRunLive } from "./test-run-live.js";
import { renderWorkflowComplete } from "./workflow-complete.js";
import { renderWorkflowProgress } from "./workflow-progress.js";

export function renderView(data: Record<string, unknown>, _app: App): void {
  void _app;
  const root = document.getElementById("root");
  if (root === null) {
    return;
  }

  const view = data.view;
  const known =
    view === "workflow-progress" ||
    view === "workflow-complete" ||
    view === "design-approval" ||
    view === "test-run" ||
    view === "refactor-metrics" ||
    view === "coverage";

  if (!known) {
    return;
  }

  root.innerHTML = "";

  switch (view) {
    case "workflow-progress":
      renderWorkflowProgress(root, data);
      return;
    case "workflow-complete":
      renderWorkflowComplete(root, data);
      return;
    case "design-approval":
      renderDesignApproval(root, data);
      return;
    case "test-run":
      renderTestRunLive(root, data);
      return;
    case "refactor-metrics":
      renderRefactorMetrics(root, data);
      return;
    case "coverage":
      renderCoverage(root, data);
      return;
  }
}

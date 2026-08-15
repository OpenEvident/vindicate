/**
 * @file Markdown fallback when MCP Apps UI is unavailable (D-043 / communication.md).
 */
import type { WorkflowPhaseRow } from "./workflow-phases.js";

export function formatWorkflowProgressMarkdown(input: {
  phaseLabel: string;
  phases: readonly WorkflowPhaseRow[];
  warnings?: readonly string[];
  nextCall?: string;
  terminal?: boolean;
}): string {
  const lines: string[] = ["### Vindicate — In progress", "", `**Current:** ${input.phaseLabel}`];

  if (input.phases.length > 0) {
    lines.push("");
    for (const [i, p] of input.phases.entries()) {
      const mark = p.status === "done" ? "✓" : p.status === "active" ? "●" : "○";
      lines.push(`${mark} ${i + 1}. ${p.label}`);
    }
  }

  if (input.warnings !== undefined && input.warnings.length > 0) {
    lines.push("", ...input.warnings.map((w) => `⚠️ ${w}`));
  }

  if (input.nextCall !== undefined) {
    lines.push("", `**Next:** ${input.nextCall}`);
  }

  if (input.terminal === true) {
    lines.push(
      "",
      "**Workflow spine complete.** Render audit summary via vindicate_show_panel if not already."
    );
  }

  return lines.join("\n");
}

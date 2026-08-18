/**
 * @file Shared Vindicate agent rule text for Cursor (.mdc), Copilot (copilot-instructions.md),
 * Claude (CLAUDE.md), and Antigravity (.agents/AGENTS.md).
 */

export const VINDICATE_RULE_BODY = `# Vindicate Rules

Vindicate handles Playwright test automation (writing, adding, fixing, stabilizing, refactoring, running,
and auditing tests; scaffolding; CI). When the user asks for any of that, use the Vindicate skill — call
\`vindicate_workflow\` first; its response carries the full phase-by-phase procedure. For general coding,
documentation, or questions, work directly — do not call Vindicate tools.

Full conventions (selectors, code structure, codegen vs. direct edit, story traceability, secrets,
communication style) live in the Vindicate skill — read it once engaged. This file only covers the
trigger condition above and the two rules below, which apply regardless of task.

- Read \`.vindicate/rules.md\` first if it exists — project-specific overrides there take precedence over
  everything else.
- Never delete or overwrite anything under the \`.vindicate/\` folder.
`;

export const VINDICATE_CLAUDE_MARKERS = {
  start: "<!-- vindicate:start -->",
  end: "<!-- vindicate:end -->"
} as const;

export function buildClaudeMdBlock(): string {
  return `${VINDICATE_CLAUDE_MARKERS.start}\n${VINDICATE_RULE_BODY}\n${VINDICATE_CLAUDE_MARKERS.end}`;
}

// Separate markers from Claude's, even though the delimiter text is identical, so CLAUDE.md and
// .agents/AGENTS.md can evolve independently of each other without one writer's find/replace logic
// accidentally matching the other file's markers.
export const VINDICATE_AGENTS_MARKERS = {
  start: "<!-- vindicate:start -->",
  end: "<!-- vindicate:end -->"
} as const;

export function buildAgentsMdBlock(): string {
  return `${VINDICATE_AGENTS_MARKERS.start}\n${VINDICATE_RULE_BODY}\n${VINDICATE_AGENTS_MARKERS.end}`;
}

export const VINDICATE_CURSOR_MARKERS = {
  start: "<!-- vindicate:start -->",
  end: "<!-- vindicate:end -->"
} as const;

// Body only, no frontmatter — frontmatter must be the file's literal first bytes for Cursor to parse it.
export function buildCursorMdcBlock(): string {
  return `${VINDICATE_CURSOR_MARKERS.start}\n${VINDICATE_RULE_BODY}\n${VINDICATE_CURSOR_MARKERS.end}`;
}

export function buildCursorMdcFile(): string {
  return `---
description: Vindicate test automation — workflow and tool rules
alwaysApply: true
---

${buildCursorMdcBlock()}`;
}

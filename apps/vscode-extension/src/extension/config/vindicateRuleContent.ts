/**
 * @file Shared Vindicate agent rule text for Cursor (.mdc), Copilot (copilot-instructions.md),
 * Claude (CLAUDE.md), and Antigravity (.agents/AGENTS.md).
 */

export const VINDICATE_RULE_BODY = `# Vindicate Rules

Vindicate handles Playwright test automation (writing, adding, fixing, stabilizing, refactoring, running,
and auditing tests; scaffolding; CI). When the user asks for any of that, use the Vindicate skill and
tools. For general coding, documentation, or questions, work directly — do not call Vindicate tools.

## Start here
- For any test-automation task, call \`vindicate_workflow\` first. Mandatory phase steps are in each response's \`phase_instructions\`. Follow \`progress_display.instruction\` exactly (server detects MCP App panel support).
- **Stateless progress:** pass \`path\` once started; on each phase change pass \`node\`, \`from\`, and \`completed\` (node ids fully done). **Copy \`progress_echo\` from every response into the next call** — there is no job id.
- Follow \`agent_directives.next_when_ready\` when a phase done-conditions are met. Do not skip phases or their done-conditions.
- Read \`.vindicate/rules.md\` first if it exists — project-specific overrides there take precedence over
  everything below.
- Never delete or overwrite anything under the \`.vindicate/\` folder.

## Selectors — never guess
- Never invent or guess a selector. Ground every locator with \`browser_read\` against the live page (or
  an existing recording).
- XPath-first. Use \`getByRole\` only when XPath is genuinely unreachable, and say why. No CSS, no
  \`getByLabel/Placeholder/Text/TestId/Title\`, no \`.or()/.filter()/.first()/.nth()/.last()\`. One match
  only (uniqueness == 1).

## Code structure
- Tests live only in \`tests/<feature>.spec.ts\`; page objects in \`pages/\`, panels in \`panels/\`. Never create
  \`src/ features/ e2e/ specs/ __tests__/\`.
- All source is \`.ts\` — never \`.js/.jsx/.mjs/.cjs\`.
- 7-token naming: the same noun across the story, \`support/data/<x>/\`, \`<X>Page\`, the fixture \`<x>Page\`,
  \`<x>Expected\`, \`tests/<x>.spec.ts\`, and the \`describe\` title.

## Codegen vs direct edit (files are the source of truth)
- New feature → \`vindicate_generate_code\` mode \`create\` — it wires page objects, the barrel
  (\`page-loader.ts\`), config (\`page.config.ts\`), the spec, and \`expected.json\`. Once per feature —
  never re-run \`create\` on an existing feature; it regenerates and clobbers hand edits.
- New page in an existing feature → \`register_page\`. New \`test()\` in an existing spec →
  \`add_test_cases\`.
- Every other change (locators, steps, assertions, deletes, refactors) → edit the \`.ts\` files directly,
  following the conventions. \`npm run audit\` (tsc) is the real gate.

## Story traceability
- Stories use stable keys: \`AC-<n>:\` under \`# Acceptance Criteria\`; scenario headings end with the tag,
  e.g. \`## Happy Path [AC-1]\`.
- Every spec starts with \`// spec: .vindicate/stories/<feature>.story.md\`.
- Every test has \`// scenario: <name>\` before it, and a title starting with exactly one \`[AC-n]\` tag
  that exists in the linked story. If a traceability field is missing or invalid, fix it before
  finishing.

## Secrets
- \`.env\` is the only secret source; reference via \`process.env.X!\`. Never bake a credential into a
  \`fill\`/\`select\` value or into \`expected.json\`.

## Communication
- Speak plain language — what you found, what you did, what's next — with light progress markers
  (🔍 📝 ▶️ 🩹 ✅).
- Don't expose internal terms (node names, "graph", "MCP", "workflow", node IDs) to the user.
`;

export const VINDICATE_RULE_MDC = `---
description: Vindicate test automation — workflow and tool rules
alwaysApply: true
---

${VINDICATE_RULE_BODY}`;

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

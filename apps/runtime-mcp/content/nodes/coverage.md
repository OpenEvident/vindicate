---
node: coverage
graph: main
label: Coverage
entry_for: [coverage]
modes: []
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation]
---

# Coverage

## Goal

Produce an **AC-level coverage report** — what's tested vs what's missing — from the stories, the
specs, and (when available) the screens mapped in `ground`. Then either report (analysis only) or
continue into authoring the top gaps.

**Two entry contexts:**

- `coverage` path (direct entry) — a **read-only stories↔specs AC diff. Do not open a browser** /
  explore; step 3 (screen cross-reference) is skipped or best-effort from memory only.
- `gaps` path (via `ground`) — same diff, **plus** the live exploration inventory from `ground` to
  surface UI areas with no tests at all.

## Inputs

- Stories: `.vindicate/stories/*.story.md` (the AC source).
- Specs: `tests/*.spec.ts` (the `[AC-n]` tags actually present).
- Screens/elements mapped in `ground` (gaps path).

## Steps

1. **Inventory** — list each story and map it to `tests/<feature>.spec.ts` if present. Flag stories with **no spec** as highest-priority gaps.
2. **AC diff per approved story** (skip `deprecated`): AC IDs from the story vs `[AC-n]` tags in the spec titles → report **covered / missing / stale**. Fallback to `// scenario:` vs scenario headings when a story has no AC IDs.
3. **Cross-reference** the screens explored in `ground` against the automated areas — surface UI areas with no tests at all.
4. **Render the coverage panel** via `vindicate_show_panel` (coverage / coverage-matrix).
5. **Recommend** the top gaps worth filling (not an exhaustive dump).

## Tools

- `vindicate_show_panel` — render the coverage / coverage-matrix panel (data-heavy display).

## Rules

- Coverage is **derived at runtime** from stories + specs + exploration — never written to a stale `coverage_inventory.md` file.
- Report the **actionable top gaps**, not every theoretical gap.
- Analysis only by default — do not start writing tests unless the user opts to fill gaps now.

## Output

- A coverage report: per-feature covered / missing / stale ACs; features with story-but-no-spec; unexplored areas.
- **Report (chat):** one line — e.g. `📊 Coverage: 32/40 ACs covered · 3 features with no spec · top gap: <feature>.`

## Transitions

- a gap report was produced and the user wants analysis only → **audit**
- the user chose to fill the gaps now (continue as a write flow) → **design**

## Escalation

- `ground`/exploration was skipped → note reduced confidence in the summary.
- Empty memory/stories → fall back to file listing; scope to the requested area if the repo is large.

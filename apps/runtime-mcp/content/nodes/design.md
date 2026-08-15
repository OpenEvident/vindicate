---
node: design
graph: main
label: Design
entry_for: [refactor]
modes: [write-plan, refactor-plan]
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation, mode-slice]
---

# Design

## Goal

The single **design-and-approve gate before any code**. By now `ground` has explored the live app,
so this is where the story is _finalized_: the AI proposes worthwhile additional scenarios, the user
adds/removes, the agreed set gets sequential `[AC-n]`, the feature slug is locked, the story is
validated and approved, and each scenario is mapped to a concrete test shown in the design panel for
one explicit confirmation. No code is written or restructured here. (This story-finalization arc is the
**write** path; on the **refactor** path there is no story to approve — see the refactor-plan slice, where
this gate only confirms the restructure plan.)

## Inputs

- **Drafted** story (`.vindicate/stories/<feature>.story.md`, `status: draft`) with candidate (un-numbered) scenarios + the proposed feature slug from `understand`.
- Captured element identities from `ground` (carried in-context) and any finalized recordings — so the plan references real targets and so coverage of each scenario can be checked.
- Existing spec/page objects (DRY — reuse what's there).
- For refactor: the duplication/structure findings (see refactor-plan mode).

## Steps (write-plan; refactor uses its mode slice)

1. **Reconcile** the drafted candidate scenarios against what `ground` found in the live app, plus what existing tests already cover.
2. **Propose additions (bounded).** Suggest a _small_ set of high-value adjacent scenarios for the same feature (likely error/boundary/edge cases a tester would want), each clearly flagged in the panel as a **suggestion** vs the user's original ask. No exhaustive dump, no silent additions.
3. **Reconcile with the user via the panel.** Map each scenario to a test title `[AC-n] should <present-tense verb> <observable outcome>` (≤60 chars). The user adds/removes freely; treat chat feedback as panel edits and re-call **`vindicate_design`** with the updated `suites` and the prior design as `previous` (add/modify/remove badges) until the set is settled.
4. **Coverage check (groundable plan).** A scenario is groundable when it has **a finalized recording or live-captured locator evidence from `ground`**. Any agreed scenario with neither → return to **`ground`** to capture it (`design → ground`), then come back here to delta-confirm. Never approve a plan you can't ground.
5. Resolve the layer per scenario (default **UI**; **hybrid** for ≥4-step flows or ≥3 seeded backend records; **API-only** when no UI element is in the verification). For hybrid, note the API seed → UI verify boundary.
6. **Finalize the story:** assign sequential `[AC-n]` to the agreed scenarios, **lock the feature slug** (the 7-token noun used everywhere downstream), `vindicate_validate_story`, and set `status: approved`. Fix any validation error and re-validate; never approve a failing story. **If the locked slug differs from the one `understand` proposed**, rename the draft to `.vindicate/stories/<slug>.story.md` so the 7-token naming is consistent before any code is generated.
7. **Build the write plan + confirm once.** Target spec (`tests/<feature>.spec.ts`), operation (`write_new` for a new feature, `edit_append` for adding to an existing spec), estimated test count, fixtures/page objects involved → render via `vindicate_design`, then ask **once** via `vindicate_ask_user`: "Does this look right?"

## Tools

- `vindicate_design` — render/update the design-approval panel (the merged set/update design tool); pass `previous` to show edit badges.
- `vindicate_validate_story` — validate story frontmatter + structure before setting `status: approved`.
- `vindicate_ask_user` — the single approval question.

## Rules

- **Approval lives here, after exploration** — the story flips `draft → approved` only at this gate, with `[AC-n]` assigned and the slug locked; `understand` only drafted it.
- **Propose, don't impose** — AI-suggested scenarios are flagged and optional; the user's agreed set is authoritative. No silent additions, no exhaustive dump (mirror the "top gaps, not every gap" discipline).
- **Approve only a groundable plan** — every approved scenario must have captured evidence; otherwise `design → ground` first, then return.
- **One test per AC** — each `[AC-n]` testcase maps to exactly one automation `test()` with the same `[AC-n]` title prefix. No multi-AC tags.
- **Atomic ACs** — split acceptance criteria at page transitions, wizard steps, and major state changes; never collapse a multi-page flow into a single AC-1.
- **BDD testcases** — testcase bodies use Given/When/Then, not step bullets.
- **FA tags stay stable** — when renumbering AC-n after spec changes, keep `[FA-x-y]` Feature bullets unchanged.
- **Spec ↔ story sync** — if a spec is edited (tests added/removed/renamed), update the story's AC lines, testcase headings, and Feature bullets to match; story test count must equal spec test count.
- **Plan, don't write.** No page-object or spec files are created here; this node produces the approved story + plan. Code happens in `generate`.
- **DRY first** — reuse existing page objects, fixtures, and locators; the plan names what's reused vs new.
- **Atomic tests** — one verification objective per test (related assertions that form one logical "on the right page" check may group).
- **Don't re-ask** settled facts; the panel is the review surface — one short acknowledgement, never paste panel contents into chat.

## Mode slices

### write-plan (write path)

Reconcile the drafted candidates against `ground`'s findings → propose bounded additions → settle the set with the user via the panel → check every scenario is groundable (`design → ground` for gaps) → assign `[AC-n]`, lock the slug, `vindicate_validate_story`, approve the story → build the write plan (target spec, `write_new`|`edit_append`, count) → single panel confirmation.

### refactor-plan (refactor path)

1. **Traceability pre-check:** every `// scenario:` comment still matches a story scenario — surface mismatches first. 2. Run DRY/duplication checks (duplicate locators, step methods, fixtures, page objects; fuzzy-title and step-equivalence duplicates). 3. Summarize the extraction/consolidation plan with risks (shared fixtures, serial tests) — **test outcomes must not change**. 4. Same panel + single confirmation gate.

## Output

- An **approved** story (`status: approved`, sequential `[AC-n]`, locked slug) **and** an approved `TestDesign`: suite, write plan, `[AC-n]` test titles, layer per test, `user_confirmed: true`.
- **Report (chat):** one line — e.g. `📋 Approved: <feature> — N tests (AC-1..AC-N).`

## Transitions

- the story + test plan were approved by the user → **generate**
- an approved scenario has no captured locator evidence → **ground** (capture it, then return here to delta-confirm)

## Escalation

- `vindicate_design` failure → report the error; do not advance.
- `vindicate_validate_story` errors → fix the story and re-validate; never approve a failing story.
- All scenarios already covered (nothing to plan) → ask whether to stop or pick a different area.
- User rejects the plan repeatedly → capture what they want changed; revise, don't proceed on an unapproved plan.

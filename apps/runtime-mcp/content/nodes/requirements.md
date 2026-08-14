---
node: requirements
graph: main
label: Requirements
entry_for: [requirements]
terminal: true
modes: []
serves: [goal, inputs, steps, tools, rules, output, escalation]
refs: [ref-requirements]
---

# Requirements

## Goal
Draft a **requirements/story** document from a **user-provided recording** — nothing else. Write
`.vindicate/stories/<feature>.story.md` using the deliveroo-style top: **title + prose**, **Persona**,
`# Feature` with `[FA-x-y]`, granular `# Acceptance Criteria`, BDD `## [AC-n]` testcases (no
Pre-conditions or Testcases wrapper). Leave `status: draft`. Do **not** explore the live app,
capture locators, approve the story, generate automation, or write any code.

## Inputs
- The recording — name and/or artifact path from the user's request. Confirm via `browser_record_list`,
  then read with `browser_record_read`.
- `.vindicate/domain.md` and `.vindicate/context.md` if present — use domain-id for FA tag assignment.
- All existing `.vindicate/stories/*.story.md` — scan for FA tags already in use (project-wide uniqueness).

## Steps
1. **Confirm the recording.** `browser_record_list` → `browser_record_read`. If missing or empty,
   escalate — do not invent a flow.
2. **Reuse prior context.** Read domain/context memory and any existing story. Do not re-ask settled facts.
3. **Scan existing FA tags** across all story files before assigning new `[FA-x-y]` tags.
4. **Derive the feature slug** from the recording name (lowercase, hyphenated). Ask once via
   `vindicate_ask_user` only if ambiguous.
5. **Resolve the story** at `.vindicate/stories/<feature>.story.md`:
   - **Missing** → draft using the top structure in `ref-requirements`.
   - **Draft** → update only what the recording clarifies; preserve existing FA/AC IDs where possible.
   - **Approved already** → do **not** silently rewrite; ask before changing.
6. **Translate the recording** (see `ref-requirements`):
   - H1 title + prose verification objective.
   - `**Persona**` — roles and credential env vars.
   - `# Feature` — `[FA-{domain-id}-{sub-domain}]` bullets (one per major capability phase; unique project-wide).
   - `# Acceptance Criteria` — **split by phase** (login, navigation, wizard submit, verify/open, etc.).
     Plain `AC-n:` lines — **never one mega-AC for the whole recording**.
   - `## {Name} [AC-n]` — one BDD testcase per AC (Given/When/Then), placed directly after ACs.
   - `# Out of Scope` — adjacent flows not covered (unchanged style).
   - Propose extra edge-case testcases only as **suggestions in chat**.
7. **Ask only for genuinely missing high-value facts** — one question at a time via `vindicate_ask_user`.
8. **Stop.** Write/update the draft story. Report feature slug, FA count, AC count, testcase count
   (AC count must equal testcase count).

## Tools
- `browser_record_list`, `browser_record_read`, `vindicate_ask_user`

## Rules
- **Recording is the evidence.** Never invent behaviour not in the recording (or explicitly confirmed).
- **Deliveroo-style top** — title, prose, Persona, Feature `[FA-x-y]`, granular ACs, BDD `## [AC-n]`.
  No `# Pre-conditions`, no `# Testcases` wrapper, no AC checkboxes, no step-bullet testcases.
- **FA uniqueness** — every `[FA-x-y]` must be unique across all story files in the project.
- **1:1 AC ↔ testcase** — every `AC-n:` has exactly one `## … [AC-n]` block; counts must match.
- **Split ACs by phase** — multi-page / multi-step recordings need multiple ACs, not a single AC-1.
- **Spec sync** — if tests exist for this feature, story AC count must match spec test count (see `ref-requirements`).
- **Draft only.** Leave `status: draft`. Do not call `vindicate_validate_story` to approve.
- **No automation.** Never call `vindicate_generate_code`. Never touch `tests/`, `pages/`, or `panels/`.
  Never run `npm run audit`.
- **Propose, don't impose** — suggested edge cases are flagged in chat, not silently added.

## Output
- A **drafted** `.vindicate/stories/<feature>.story.md` with deliveroo-style top + Out of Scope + Change Log.
- **Report (chat):** one line — e.g. `📝 Requirements drafted: <feature> — FA-01-4..FA-01-N, AC-1..AC-M, M testcases (no automation).`

## Escalation
- Recording missing / empty → stop; ask user to finalize or provide the correct name.
- Ambiguous feature name → one `vindicate_ask_user` before writing.
- Approved story conflicts with recording → ask before overwriting.
- FA tag collision with another story → pick the next free sub-domain or ask the user.

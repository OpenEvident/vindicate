---
ref: ref-requirements
note: Appended to the requirements node. Guidance for drafting high-quality stories from a recording.
---

# Writing good requirements from a recording

Use this when drafting `.vindicate/stories/<feature>.story.md` from a finalized Vindicate recording.
The recording is the primary evidence — treat it like a witnessed walkthrough, not a prompt to invent.

## Story top structure (before Out of Scope)

Every story uses this order for the **top part** (Out of Scope and Change Log stay at the bottom, unchanged):

1. **`# {Human Title} — {context}`** — readable title (not the slug). One short prose paragraph stating the verification objective.
2. **`**Persona**`** — role(s), auth method, credential env-var names (never literal secrets).
3. **`# Feature`** — capability bullets tagged `[FA-{domain-id}-{sub-domain}]` (high-level only).
4. **`# Acceptance Criteria`** — plain `AC-n:` lines, one atomic outcome each.
5. **`## {Name} [AC-n]`** testcases — Given/When/Then BDD directly under ACs (no `# Testcases` wrapper).

## Traceability chain

| Layer                | Tag                                 | Lives in                  | Maps to                             |
| -------------------- | ----------------------------------- | ------------------------- | ----------------------------------- |
| Feature requirement  | `[FA-x-y]`                          | `# Feature` bullets       | Future overall requirement coverage |
| Acceptance criterion | `AC-n:`                             | `# Acceptance Criteria`   | One atomic observable outcome       |
| Testcase             | `[AC-n]` on `##` heading            | After AC section          | Exactly one AC                      |
| Automation script    | `[AC-n]` at start of `test()` title | `tests/<feature>.spec.ts` | Same AC as its testcase             |

Rules:

- **One AC per testcase** — each `## … [AC-n]` maps to exactly one AC line above.
- **One test() per testcase** — automation titles start with the same `[AC-n]`.
- **Split ACs by phase** — page transitions, wizard steps, and major state changes each get their own AC. Never collapse a multi-page recording into AC-1.
- **FA tags are project-unique** — every `[FA-x-y]` must be unique across all `.vindicate/stories/*.story.md` files. Scan existing stories before assigning new tags.

## FA tag format

- Pattern: `[FA-{domain-id}-{sub-domain}]` — e.g. `[FA-01-4]`, `[FA-01-5]`.
- **domain-id** — numeric area from `.vindicate/domain.md` (e.g. `01` = authentication, `02` = projects).
- **sub-domain** — numeric capability within that domain for this story (increment per bullet).
- **Uniqueness** — never reuse an `[FA-x-y]` that already appears in another story file.
- Before drafting, list existing FA tags via all story files (or `vindicate_validate_story` on save).
- **`.vindicate/domain.md` doesn't exist yet (first feature in a new project)** — create it now: a short
  markdown table (`| ID | Domain |`) with one row, `01` mapped to the current feature's broad area
  (e.g. `checkout`, `auth`). Every later feature either reuses an existing domain-id (a new capability
  in the same area) or appends the next unused two-digit id for a genuinely new area — never renumber
  or reuse an id already assigned to something else once written.

## Spec ↔ story sync rules

When `tests/<feature>.spec.ts` changes, update the linked story to stay in sync:

| Spec change                   | Story update required                                                            |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Add a `test()`                | Add `AC-n:` line, matching `## … [AC-n]` testcase, and `[FA-x-y]` Feature bullet |
| Remove a `test()`             | Remove the matching AC, testcase, and Feature bullet (or deprecate the story)    |
| Rename `// scenario:` comment | Rename the matching `##` testcase heading                                        |
| Change `[AC-n]` in test title | Renumber AC lines and `## … [AC-n]` headings together; keep FA tags stable       |
| Extra test without story AC   | **Invalid** — story drives test count (C16)                                      |

**Story is source of truth for count.** Spec test count must equal story AC count. FA tags stay stable across renumbering — only AC-n and testcase headings change.

## Anti-patterns (do NOT do this)

- One AC sentence listing login + wizard + verify + open detail in a single line.
- `# Pre-conditions` or `# Testcases` wrapper headings.
- `- [ ]` checkboxes on AC lines.
- Step-bulleted testcases instead of Given/When/Then BDD.
- Duplicating the entire recording verbatim in every testcase body.
- Reusing `[FE-n]` or sequential-only tags — use `[FA-x-y]` with project-wide uniqueness.
- Reusing an `[FA-x-y]` tag from another story file.

## Section guidance

### Title + prose

- H1 is human-readable: `# Login and Create Automation Project` (not `login-adn-create-automation-project`).
- Follow with 1–3 sentences: what the recording proves end-to-end.

### Persona

```md
**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)
```

- List each role and how credentials are supplied (env vars, SSO, etc.).
- Entry URL and starting state belong in testcase **Given** clauses, not a separate Pre-conditions section.

### Feature `[FA-x-y]`

- `# Feature` with bullets tagged `[FA-01-4]`, `[FA-01-5]`, …
- Capability-level statements only — no step-by-step detail.
- Assign domain-id from `.vindicate/domain.md`; increment sub-domain per capability phase.

### Acceptance Criteria `AC-n:`

- Plain lines: `AC-1: User signs in and lands on the dashboard.` (no checkboxes).
- **Atomic** — one verifiable outcome per AC.
- Split multi-page flows: sign-in → navigation → wizard submit → verify/open = separate ACs when the recording covers each phase.
- Each AC must have a matching `## … [AC-n]` testcase below.

### Testcases (BDD, no wrapper heading)

- Place `## {Name} [AC-n]` blocks immediately after the AC list.
- Use **Given / When / And / Then** — not bullet steps.
- Each testcase covers its AC's phase; chain context via Given (e.g. "Given an authenticated user on the dashboard").
- Propose extra edge-case testcases only as **suggestions in chat** — do not silently add them.

## Feature slug

- Frontmatter `feature:` slug: lowercase, hyphenated (`login-create-automation-project`).
- H1 title is separate from the slug.

## Story file checklist

```md
---
feature: <feature-slug>
status: draft
version: 1
generated: <YYYY-MM-DD>
last_updated: <YYYY-MM-DD>
source:
  - recording:<recording-name>
---

# <Human Title> — <context>

<1–3 sentence verification objective grounded in the recording.>

**Persona**
<role> — credentials via <ENV_VARS> (from .env)

# Feature

- [FA-01-4] <capability phase 1>
- [FA-01-5] <capability phase 2>

# Acceptance Criteria

AC-1: <atomic outcome for phase 1>
AC-2: <atomic outcome for phase 2>

## <Phase Name> [AC-1]

Given <starting context>
When <action>
Then <observable outcome>

## <Phase Name> [AC-2]

Given <context carried from prior phase>
When <action>
Then <observable outcome>

# Out of Scope

- <excluded adjacent behaviour>

# Change Log

- <YYYY-MM-DD>: drafted from recording <name> (agent)
```

## Explicit non-goals (requirements path only)

- No Playwright automation — do not write or edit `tests/`, `pages/`, or `panels/`.
- No `vindicate_generate_code`, no live browser exploration, no locator capture, no `npm run audit`.
- Leave `status: draft` — approval happens later on the `write` path in `design`.

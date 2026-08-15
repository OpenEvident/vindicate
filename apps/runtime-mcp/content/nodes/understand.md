---
node: understand
graph: main
label: Understand
entry_for: [write]
modes: []
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation]
---

# Understand

## Goal

Capture what to test as a **drafted** story before any capture or code — the requirement the rest of
the loop traces back to. The story is **not approved here**: it is finalized and approved later, in
`design`, once the live app has been explored (you have the best picture of the real flows then). Ask
only for genuinely missing facts; never invent.

## Inputs

- The user's request (the feature/area, any URL, persona, edge cases they named).
- `.vindicate/domain.md` and `.vindicate/context.md` if present — terminology + paths only; do not re-ask answered facts. **If `.vindicate/domain.md` doesn't exist yet** (first feature in a new project), create it: a one-row markdown table assigning domain-id `01` to this feature's broad area (e.g. `checkout`, `auth`) — needed for the `[FA-{domain-id}-{sub-domain}]` tag the draft story's `# Feature` section requires (see `ref-requirements` → _FA tag format_).
- `.vindicate/stories/<feature>.story.md` if it already exists.
- `.vindicate/config.json`'s `target` (`ui`/`api`/`both`, written by `setup`) — what infrastructure this project actually has. Governs which `layer` values are even offerable (see Rules).
- Existing recordings — call `browser_record_list` to see what flows/pages are already captured.

## Steps

1. **Reuse prior context.** Read the domain/context memory and any existing story first. Carry forward anything already known (feature slug, ACs, persona). Do not re-ask.
2. **Resolve the story** at `.vindicate/stories/<feature>.story.md`:
   - **Approved already** → note which scenarios are covered vs missing; skip the interview.
   - **Draft** → fill only the missing slots; leave it `status: draft`.
   - **Missing** → gather the requirement one question at a time (see Rules — slots) and write the story as a **draft**: the verification objective + persona + a **candidate scenario list** (plain `## <Name>` headings, **un-numbered** — no `[AC-n]` yet). Do **not** validate or approve here; `design` assigns the final `[AC-n]`, validates, and approves after the app is explored.
3. **Propose the feature slug** (lowercase noun) — a _provisional_ proposal that `design` locks at approval. It seeds the 7-token naming for everything downstream, but nothing between here and `design` consumes it, so it can still change.
4. **Determine `app_source_found`** — `true` only when the repo contains the application-under-test UI source (product `app/`, `components/`, product `src/`), `false` for a Playwright-only project testing a deployed URL. A harness-only `src/` (page objects + config) is **not** app source. Ask once only if genuinely unsure.
5. **Check existing recordings** (`browser_record_list`) — note covered flows, their pre/post conditions, and prerequisites, so `ground` doesn't re-capture what exists and can link `depends_on`.

## Tools

- `vindicate_ask_user` — for genuinely missing requirement slots (structured; one question at a time). Story _approval_ is not asked here — that happens in `design`.
- `browser_record_list` — inventory existing recordings.

## Rules

- **Requirement slots (ask only for missing, no silent invention):** verification objective (one sentence — always required); persona (default `users.admin`; ask when outcome depends on role); entry context (default fresh session at `BASE_URL`); expected outcome (always for new tests); edge cases (default happy-path only; ask when the user says "validate / errors / boundary"); **layer** — `ui`, `api`, or `hybrid` (a spec that pulls fixtures from both, via direct-edit after `create` — see `generate`). Default follows the project's scaffolded `target`: `ui` for a `ui`- or `both`-scaffolded project, `api` for an `api`-only one. Ask explicitly for `hybrid`/hand-mixed intent, for ≥4-step flows / ≥3 seeded records, or whenever the user's request itself names both a UI action and an API call. **Never offer a layer the project wasn't scaffolded for** (`api` in a `ui`-only project, `ui` in an `api`-only one) — if the user wants a layer that's missing, say so and point back to `setup` to re-run `scaffold_project` with a broader `target` (additive, safe to re-run) before continuing. Only these documented defaults may be applied silently — for anything else, ask.
- **Story structure (draft):** frontmatter `feature`, `status: draft`, `version: 1`. Use the deliveroo-style top:
  H1 title + prose verification objective, `**Persona**`, `# Feature` (`[FA-x-y]` — unique project-wide),
  `# Acceptance Criteria` (plain `AC-n:` lines), `## <Name> [AC-n]` BDD testcases (Given/When/Then — no `# Testcases` wrapper), `# Out of Scope`.
  On the write path, testcases may start un-numbered here; `design` assigns final `[AC-n]` at approval.
  Stories drafted via the `requirements` path from a recording should already carry full FA/AC IDs and BDD testcases.
- **7-token naming starts here (provisionally):** the proposed feature noun `<x>` is intended to be used unchanged across story file, data folder, page class/file, fixture key, barrel export, spec file, describe title (no synonym/plural/casing drift). It is _proposed_ here and _locked_ in `design`.

## Output

- A **drafted** `.vindicate/stories/<feature>.story.md` (`status: draft`) with **candidate** scenarios (un-numbered).
- Carried forward: proposed `feature` slug, `app_source_found`, recording inventory notes, and whether the user **provided a recording to automate** (a hint that `ground` runs in `recording-ingest` mode).
- **Report (chat):** one line — e.g. `📝 Story drafted: <feature> — N candidate scenarios (approval in design).`

## Transitions

- requirement drafted and elements not yet captured → **ground**

## Escalation

- Ambiguous feature name → resolve with one `vindicate_ask_user` before writing the draft.
- Two intents in one request → ask which to run first.

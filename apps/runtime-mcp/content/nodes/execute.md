---
node: execute
graph: main
label: Execute
entry_for: [smoke]
modes: []
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation]
---

# Execute

## Goal
Run the targeted Playwright tests via `run_tests` and summarize the result for routing — pass → audit,
fixable failures → heal, app bug → escalate.

## Inputs
- Scope: the spec path or tag to run (from the current work — the feature just generated, or the smoke target).
- `.env` credential vars the tests need.

## Steps
1. **Scope the run** — a spec path (`tests/<feature>.spec.ts` or `tests/<feature>.api.spec.ts`) or a tag; for `smoke`, the reachability spec(s) for whatever layer(s) the project was scaffolded with (`smoke.spec.ts` / `api-smoke.spec.ts` / both). `run_tests` is layer-agnostic — it runs whatever spec files match the scope, UI or API, no special-casing needed.
2. **Env gate** — if required credential vars in `.env` are empty/placeholder, stop and list the keys for the user to fill. Do not run with missing creds.
3. **Call `run_tests` only** — never a terminal runner / `npx` / full-suite headless during creation.
4. **Summarize** — the `summary` field already gives one line pass/fail with counts; on failure, read each failed test's own `error` (one-line) and, if present, `context` — before falling back to a fresh `browser_read`/`browser_diagnose` in `heal`. `context` is Playwright's own auto-generated failure explanation *plus a full accessibility-tree snapshot of the page at the moment of failure* — for locator-rename/content-drift classes (see `heal`'s classifier table) this is often enough to classify without a new browser call at all.
5. **Route** — set the outcome that selects the next node (see Transitions).

## Tools
- `run_tests` — spawn Playwright, parse the JSON report. (The only runner.)

## Rules
- `run_tests` is the only execution path — no `npx playwright test`, no terminal, no full-suite headless run during creation.
- Keep the chat terse: pass → one line; fail → count + first failure; tool error → one line ("see panel" if a panel is shown).
- Don't fix here — `execute` only runs and routes. Fixes happen in `heal`/`generate`.
- **Reading a failed test's diagnostics, in order of cost:** `error` (always present, one line) → `context` (present only on the first failing test per run — Playwright's failure explanation + page snapshot, already free, no extra call) → `attachments` (screenshot/video/error-context/trace file paths — open directly if `context` isn't enough) → only then a fresh `browser_read`/`browser_diagnose` in `heal`.
- **`tests` is failed-first**, not file/execution order — passes and skips sort after every failure, so if the response gets trimmed for size, what survives is always the most useful subset, not whatever happened to run first.
- **A run with many failures may not show every test.** Check `tests_total` vs `tests_shown` (both present whenever the response was trimmed) — if some are missing, `omitted_failures` (a compact `{title, file, error}` list) still covers every cut failure, enough to judge "same root cause as what I can see" without another round trip. For a genuinely different, uninvestigated failure, narrow with `spec_filter`/`grep` and re-run.

## Output
- Run result: `outcome` (pass/fail), passed/failed/skipped counts, duration, first failure detail (`error`, `context` when present, `attachments`).
- **Report (chat):** one line — e.g. `▶️ 8/8 passed (12.4s)` or `▶️ 7/8 — [AC-3] failed: <one-line error>`.

## Transitions
- all targeted tests pass → **audit**
- failures that look fixable in-workflow → **heal**
- a failure is a genuine app bug (do NOT edit tests) → **escalate**

## Escalation
- Zero tests matched → report the filter/scope issue; don't proceed as if passed.
- `run_tests` spawn error → report once; suggest checking the Playwright install. Do not retry via shell.
- Empty/placeholder credentials → stop; list the `.env` keys to fill.

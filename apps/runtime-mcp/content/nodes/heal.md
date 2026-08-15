---
node: heal
graph: main
label: Heal
entry_for: [fix, flaky]
modes: [failure-triage, flaky-triage]
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation, mode-slice]
refs: [ref-memory]
---

# Heal

## Goal

Diagnose a failing or flaky test **before** changing anything, classify the root cause, and route to
the right fix — or stop. The test may be correct and the **app** broken; do not edit tests to match
broken behavior.

## Inputs

- The failing test output / stack (which `step_*` or `verify_*` threw).
- The linked story (`// spec:` / `// scenario:` → `.vindicate/stories/<feature>.story.md`).
- The failing element's locator in the page-object `.ts` source, and any recording covering the flow.
- Existing recordings (`browser_record_list`) — for context / prerequisites; reuse, don't re-explore.

## Steps (three-stage classifier — do not skip)

1. **Stage 1 — inspect existing artifacts (no new browser/API calls).** Read the failure stack, the story, and (UI) the failing element's locator in its page-object source, or (API) the failing method's `path`/`body_type` in its resource-client source (plus any recording covering a UI flow). For a UI failure, `run_tests`'s own `context` field (see `execute`) — when present — already carries a full page-state accessibility snapshot from the exact moment of failure; check it before spending Stage 2's forensic `browser_read`, it's frequently conclusive on its own for locator-rename/content-drift/removed-element classes. If this alone is conclusive (e.g. assertion-text mismatch), classify and skip to step 3.
2. **Stage 2 — one forensic re-check (only if needed).** UI: a single `browser_read` on the failing page, compare the live a11y subtree for the failing element against the page-object locator. API: a single `api_request` to the exact endpoint (same method/path/params) the failing test hit, compare the live response against what the test expected. Both are the same principle — one real, current look at the system, not a retry loop.
3. **Stage 3 — classify and route** (see the table) — pick exactly one class.

**UI failures:**

| Diff signature                                                                                                                 | Class                                    | Route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same accessible name + role + parent path; only attribute/id changed                                                           | **Locator rename / drift**               | → **ground** (re-capture the element, fresh strategy), then generate applies it. Clean renames are quick; no user prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Accessible name OR role changed; parent intact                                                                                 | **Semantic change**                      | **Stop + ask** (bug or intentional?). Bug → escalate. Intentional → generate (update test + expected).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Element absent from the new snapshot                                                                                           | **Removed**                              | **Stop + ask** (bug or removed by design?). Bug → escalate. By design → generate (drop the step).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Element present; assertion text mismatch                                                                                       | **Content drift**                        | **Stop + ask** (real regression or copy change?). Regression → escalate. Copy change → generate (update `expected.json`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `click`/`fill` timed out (`actionTimeout` exceeded); Stage 2 `browser_read` shows the _same_ locator resolves fine, just later | **Timing / slow-loading target**         | → **generate** (direct `.ts` edit, quick, no user prompt — same tier as locator-drift): bump `actionTimeout` in `playwright.config.ts` project-wide, or add a scoped `await this.<field>.waitFor({ state: 'visible', timeout: ... })` before the failing action if only that one element needs the longer wait. **Only for a genuinely slow target confirmed by Stage 2** (a known-slow third-party widget, a heavy async render) — a failure that only reproduces _intermittently_ is real flakiness, not a load-time issue; diagnose the race instead of masking it with a bigger timeout.                                                                           |
| `browser_act`/generated step fails with `"...iframe...could no longer be located"` (or a `frame_path` hop no longer resolves)  | **Stale frame — element was superseded** | → **ground** (re-read fresh, quick, no user prompt): the locator didn't drift, the underlying iframe was torn down and replaced mid-flow (a third-party SDK remounting a widget, e.g. after a payment-method selection). Re-derive the `frame_path` from a read taken immediately before the failing action, not one captured several steps earlier. If the prior read showed a `— replaces @<ref>` badge on a sibling element and it was ignored, that's almost certainly the cause — use the one the badge pointed to. **Never** just bump `actionTimeout` for this signature — the target isn't slow, it's gone, and a longer timeout only delays the same failure. |
| App behaves wrong vs the story (test is correct)                                                                               | **App bug**                              | → **escalate** (do not edit tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Environment (missing creds, infra, network)                                                                                    | **Environment**                          | → **escalate** (user fixes infra first).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**API failures:**

| Diff signature                                                                        | Class                          | Route                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint path/method genuinely changed (e.g. route renamed, version bumped)           | **Endpoint drift**             | → **ground** (re-ground the endpoint via `api-ingest`), then generate applies it.                                                                                                                                     |
| Response status code changed on the same request (e.g. expected 200, live is 404/500) | **Semantic change or App bug** | **Stop + ask** — is this an intentional API change (generate updates the assertion) or a real regression (escalate)? A genuinely unexpected 5xx from a healthy request is almost always an app bug, not a test issue. |
| Response field renamed/restructured (schema drift, status unchanged)                  | **Semantic change**            | **Stop + ask** (bug or intentional?). Bug → escalate. Intentional → generate (update the assertion / `Type` def).                                                                                                     |
| Response body values differ but shape/status match                                    | **Content drift**              | **Stop + ask** (real regression or data change?). Regression → escalate. Data change → generate (update `expected.json`).                                                                                             |
| Auth failure (401/403) where the test expected success                                | **Environment or App bug**     | Check the credential first (expired/rotated → environment, user fixes `.env`) — if the credential is genuinely valid, it's an app bug → escalate. Never loosen an assertion to accept 401/403 as a workaround.        |
| Request times out / host unreachable                                                  | **Environment**                | → **escalate** (network/infra, not a test bug). `api_request`'s own `api.request_failed` distinguishes this from a real (if unwelcome) HTTP response.                                                                 |

## Tools

- `browser_read` — the single forensic re-snapshot for a UI failure (Stage 2).
- `browser_diagnose` — **fallback only** after `browser_read` when a step still fails and the a11y tree does not explain why (modal blocking, disabled-by-validation, target needs a prior action). Use the default viewport shot — not element scope — when the target is missing or blocked. One shot per stuck-point; diagnosis only — never to author selectors.
- `api_request` — the single forensic re-check for an API failure (Stage 2). **Fallback only** — one real call to the exact endpoint the failing test hit, to see the live status/response and compare against what the test expected. Never a proactive double-check; only after a real `execute` failure.
- **Standalone debug script** — when the a11y tree/API response and a screenshot still can't explain it because the real question is off-DOM/off-response (is this actually a 409, not a hang? do these two same-labeled elements really collide? is there a race between two endpoints?), a one-off Node/Playwright script outside the project answers it faster than more `browser_act`/`api_request` retries. Same one-shot discipline: one question, one script, delete it, translate only the finding into the fix (see `ref-contract.md`).
- `browser_record_list` / `browser_record_read` — context / prerequisites (UI flows).
- `vindicate_ask_user` — the bug-vs-intentional decisions (semantic/removed/content drift) and the 3-attempt-cap options.

## Rules

- **Ask for credentials at the point of need.** If the forensic re-snapshot (`browser_read`) lands on a page behind auth, ask for the credential _then_ via `vindicate_ask_user`, use it transiently to drive, and **never echo it back into chat**. Real runs read secrets from `.env`; anything shared in chat is flagged for rotation at close-out (see `escalate`/`audit`).
- **App bug is a hard stop** — never modify a test or `expected.json` to match broken product behavior. Route to escalate.
- **Auto-fix only the clean locator-rename class**, and only **once per element per turn**; a second drift on the same element → ask. Cap: **3 auto-fixes per turn**, then stop (the page is structurally changing) and ask.
- **3-attempt cap per element/endpoint** (snapshot / draft / tier switch, or re-probe / re-ground each count). After 3 with no green, stop and ask with options: paste a stable selector/endpoint, skip the assertion, or re-capture fresh in a new turn.
- **Don't bulk-retry / blanket-sleep.** Use Playwright auto-waiting and targeted waits, not fixed delays.
- **Spec drift = story change first.** When an intentional app change makes the _story_ stale (semantic/content drift the user confirms is intended), update `.vindicate/stories/<feature>.story.md` (and its change log) and re-confirm **before** changing the test/`expected.json` — the story stays the source of truth, never edited silently to chase the app.

## Mode slices

### failure-triage (fix path — deterministic failure)

Run the three-stage classifier above against the single failing test; route per the table.

### flaky-triage (flaky path — intermittent failure)

The failure isn't consistent — diagnose **intermittency**, not a single failure: identify the race/timing cause. Fixes (in generate) prefer Playwright auto-waiting and explicit waits over sleeps: `waitForPageLoad` after `navigate` only; `waitForURL` / `waitForResponse` after submit or async navigation; `expect.poll(...)` for async state, `Promise.all([waitForNavigation, action])` to pair nav with its trigger. Locator instability → treat as locator drift (→ ground). Last resort: mark the test `fixme` (via generate) and escalate the underlying flake. Never hide a real bug behind broad retries.

## Output

- A classification + the chosen route, and (for locator rename) the re-capture/fix in motion.
- **Report (chat):** one line — e.g. `🩺 [AC-3] locator drift → re-capturing` or `🩺 [AC-3] app bug → escalating`.

## Transitions

- root cause == locator drift (re-capture the element) → **ground**
- root cause == test/spec bug or flakiness (fix via direct edit or codegen) → **generate**
- root cause == app bug or environment (stop + report) → **escalate**

## Escalation

- Bug-vs-intentional ambiguity (semantic / removed / content drift) → `vindicate_ask_user` with the specific before/after and options.
- 3-attempt cap hit → `vindicate_ask_user`: paste selector / skip assertion / re-capture in a fresh turn.
- App bug or environment → route to **escalate** (the terminal node) — do not loop.

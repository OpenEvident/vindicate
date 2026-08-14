---
node: escalate
graph: main
label: Escalate
entry_for: []
terminal: true
modes: []
serves: [goal, inputs, steps, tools, rules, output]
---

# Escalate

## Goal
Close the workflow when the root cause is **not the test's to fix** — an app bug (product is broken,
test is correct) or an environment problem. Report clearly; do not bend the test to match broken
behavior.

## Inputs
- The `heal` classification (app bug / environment) and the affected test.
- The story's expected behavior vs the app's actual behavior.

## Steps
1. Read the classification and the affected test/scenario.
2. **Report in plain language:** what the test expects (per the story) vs what the app actually did. For environment issues: which var/infra is missing.
3. When declaring an **app bug**, capture one `browser_diagnose` screenshot first (after `browser_read`) so the report includes visual evidence of the broken UI.
4. **Do not** modify tests or `expected.json` to make a broken app pass.
5. Offer next steps via `vindicate_ask_user`: file a bug, re-run after the fix, or stop.

## Tools
- `browser_diagnose` — one fallback screenshot after `browser_read` when escalating an app bug (visual evidence only).
- `vindicate_ask_user` — present the next-step options.

## Rules
- **Hard gate:** never patch a test to match a confirmed app bug. If the user insists, require an explicit override via `vindicate_ask_user` before any edit.
- Keep it to the defect description + recommended product fix — no test changes.

## Output
- **Verdict: fail** with a summary describing the app defect (or environment gap) and the recommended fix.
- **Report (chat):** one line — e.g. `🛑 App bug: <feature> — story expects <X>, app does <Y>. Not editing the test.`
- **Secret hygiene (if any credential was shared this session — pasted in chat, typed into a recording, or written to `.env`):** add one line telling the user to treat it as exposed — rotate/invalidate it, and keep the live value only in `.env` (gitignored, never committed). Recordings may retain typed values. Err toward emitting when unsure.

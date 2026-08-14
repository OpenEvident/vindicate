---
name: vindicate
description: Use when the user wants to write, add, fix, stabilize (flaky), refactor, run, or audit Playwright browser tests, draft requirements/stories from a recording (no tests), find test-coverage gaps, scaffold a Playwright project, or set up Playwright CI. Vindicate's guided workflow for grounded, conformant Playwright test generation.
---

# Vindicate — Playwright Test Automation

You produce **grounded, conformant** Playwright tests through Vindicate's workflow. Engage this whenever
the user wants to write / add / fix / stabilize / refactor / run / audit tests, find coverage gaps, or
set up Playwright automation or CI. For general coding, docs, or questions, work directly — don't use
Vindicate tools.

## Start every task by orienting

1. **Call `vindicate_workflow()`** (no args) → map + empty progress panel. Pick the entry **path**:
   - write / add tests → `write`
   - fix a specific broken test → `fix`
   - stabilize a flaky / intermittent test → `flaky`
   - refactor tests (no behavior change) → `refactor`
   - find missing coverage by exploring the app → `gaps`
   - report AC coverage from stories vs specs (no exploration) → `coverage`
   - run existing tests against a URL → `smoke`
   - draft requirements/a story only from a recording (no tests) → `requirements`
   - scaffold a project from scratch → `bootstrap`
   - add or fix Playwright CI → `ci`

   If the task is genuinely ambiguous, ask the user which path (one question).

2. **Start the path:** `vindicate_workflow(path="write", node="understand", completed=[])` (swap path/node for your task).

3. **Each phase change:** when the current node done-conditions are met, call the next node with **`completed` updated** — add the node you just finished:

   ```text
   vindicate_workflow(path="write", node="ground", from="understand", completed=["understand"])
   ```

   Always **copy `progress_echo` from the last response** into the next call (`path`, `node`, `completed`).

4. **Read `phase_instructions`** in each tool result — mandatory phase steps at the top; workflow-tool field rules
   in the appended section. **Follow `progress_display.instruction` exactly** (server detects whether
   this client renders the MCP App panel). Use **`agent_directives`** for `progress_echo`, done-conditions,
   and the next call.

5. **Branches are allowed** (e.g. execute → heal → ground) — update `node`, `from`, and `completed` to match where you are; the panel shows heal when you enter it.

## Non-negotiables (full set in the rules file)

- **Serialize browser tools.** One `browser_*` call at a time per `session_id` — wait for each result; parallel calls fail as session busy.
- **Never invent a selector.** Ground every locator with `browser_read` against the live page (or a
  recording). XPath-first. If still stuck after a scoped re-read, use `browser_diagnose` once to see
  *why* — never to author selectors.
- **New feature → `vindicate_generate_code` `create` (once).** New page → `register_page`. New `test()`
  → `add_test_cases`. Everything else → **edit the `.ts` files directly**. The files are the source of
  truth; `npm run audit` is the gate.
- **Tests live in `tests/`**, page objects in `pages/`, panels in `panels/`, all source `.ts`, 7-token naming,
  `[AC-n]` + `// spec:` + `// scenario:` traceability, secrets only via `.env`.

## Live browser gestures (`browser_act`)

Prefer **`fill`** for value-set (text, number, range). Use **`type`** only for keystroke-sensitive fields.
**`hover`** reveals menus before click. **`drag`** needs source `ref` + `to_ref`; codegen emits `dragTo()`.
**`upload`** in exploration may use `sample` (built-in worker fixtures); generated tests use
`support/data/<feature>/` paths.

## Communication

Follow the full communication guide ([`refs/communication.md`](../refs/communication.md), appended to
this skill). The essentials:
- **Findings-first:** show what you found before asking anything — never a bare question.
- Narrate progress in plain language with light per-node markers (🔍 ground · 📝 understand · 📐 design
  · ⚙️ generate · ▶️ execute · 🩺 heal · 📊 coverage · ✅ audit) — one short line per major step.
- **Implicit continuation:** don't ask "shall I continue?" for obvious next steps — announce and proceed.
- **Don't surface internal terms** (node names, "graph", "MCP", "workflow", path names) — describe the
  actual work.
- Ask one question at a time; `vindicate_ask_user` for structured, flow-keeping choices, plain chat for
  open-ended ones.
- **On completion:** one line + one next-step suggestion — not a recap.

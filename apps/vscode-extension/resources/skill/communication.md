---
ref: communication
pulled_into: [skill]
note: Cross-cutting communication style guide for Vindicate test-automation work. Applies whenever the Vindicate skill is active — not for general coding or unrelated tasks.
---

# Communication style

Apply on every user-facing message when doing Vindicate test-automation work (any node).

## Core principle
Minimal chat; ask only when you need information the user has not already provided. One short status
line per major step. Speak plain language — what you found, what you did, what's next.

## Phase emoji mapping (use the right marker per node)

| Node | Emoji | Use |
|---|---|---|
| understand | 📝 / 🎯 | Confirming requirements / story |
| ground | 🔍 | Mapping UI elements / capturing selectors |
| design | 📐 | Test-design review |
| generate | ⚙️ | Writing tests |
| execute | ▶️ | Running tests |
| heal | 🩺 / 🔧 | Diagnosing / fixing failures |
| coverage | 📊 | Coverage analysis |
| audit | ✅ | Reviewing quality |
| escalate | 🛑 | App bug / environment — stop |
| setup (scaffold) | 🏗️ | Building project structure |

## Findings-first principle
Whenever surfacing any issue (missed element, unexpected structure, wrong URL): **show what you found
BEFORE asking anything or giving options.** Never a bare question without evidence.

## Error pattern (use exactly this structure)
What you tried → what you found → what's missing → one clear question or next step.

- ❌ Never: `ElementNotFoundError: selector .login-btn not found`
- ✅ Always: "I found 3 buttons on this page — 'Submit', 'Cancel', 'Register' — but none look like a
  login button. Can you point me to it?"

## Progress updates
- One update per major step; never more than 3 lines between updates.
- Short nodes (ground): milestone only — "🔍 Exploring /login…" then "✅ 4 elements captured."
- Long nodes (generate): granular — announce each file write.
- After `run_tests`: pass → one line; fail → count + "see panel"; error → one line.

## Implicit continuation
Never ask "shall I continue?" for obvious next steps. Announce what's next and proceed. On a clean
capture, announce the next phase and proceed immediately — no "anything missing?" gate. Hard stops only
for: genuine user input needed, a blocking gate, or a hard blocker (app unreachable).

## Ask discipline
- Use `vindicate_ask_user` for **missing facts** or **real approvals** (design panel, story draft,
  credentials, unknown URL, root-cause choice) — never to re-confirm stated intent or obvious next
  steps. One question at a time.
- Open-ended questions can be asked in plain chat (turn-end is fine there).
- Don't repeat a question in chat before/after the tool call.

## Never expose internals
Never say "which workflow / which phase", node IDs, "graph", "MCP", "phase N of N", or internal path
names (write/fix/gaps). Describe the actual work ("checking the login page…", "running the tests…").

## Post-workflow chat
When a workflow completes: **one line + one next-step suggestion** only. Example:
"✅ Done. Want me to run a smoke test?" Never a list of what was done — the summary panel handles that.

## Design panel change badges
When re-rendering the design panel after a chat modification, re-render the **full** panel with badges:
- ✅ Added — new test cases · ✏️ Modified — changed cases · 🗑️ Removed — deleted cases.
Never a partial update.

## Grilling tone
- Confident, not hedging — "I'll test X. Should I also include Y?" not "I was thinking maybe…"
- Show what you already know — "I can see you have a login page. Does it have a forgot-password flow?"
- Propose, don't interrogate — give a recommended path, ask to confirm or redirect. One question at a
  time, always.

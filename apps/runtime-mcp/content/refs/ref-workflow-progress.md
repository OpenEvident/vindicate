---
ref: ref-workflow-progress
note: Appended on orient and first path call only, not every phase update.
---

# Workflow tool — how to read this response

`vindicate_workflow` returns JSON. **Phase work for the current step** — goal, inputs, steps, rules,
tools, transitions — is at the **top** of **`phase_instructions`**. Read that fully before acting.

## Progress display (follow every call)

Each response includes **`progress_display`** — the server sets this from **this client's MCP
capabilities** (whether it renders MCP App panels). **Follow `progress_display.instruction` exactly.**

| `progress_display.mode` | Meaning                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mcp_app`               | Host renders the workflow-progress panel from `phases` / `view`. **Do not** post progress markdown in chat. |
| `markdown_in_chat`      | Host has no MCP App panel. Post **`markdown_panel`** verbatim in your next user-visible message.            |

## Other fields (same tool result)

| Field                                | Purpose                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `phases`                             | Structured checklist (✓ done · ● active · ○ pending) — used by the MCP App panel and for your state.       |
| `markdown_panel`                     | Present only when `progress_display.mode` is `markdown_in_chat`.                                           |
| `progress_echo`                      | `{ path, node, completed[] }` — **copy into every next `vindicate_workflow` call.** No server-side job id. |
| `agent_directives.done_before_leave` | Done-conditions for the **current** phase — satisfy before leaving.                                        |
| `agent_directives.next_when_ready`   | Exact next `vindicate_workflow` call when done-conditions are met.                                         |
| `warnings`                           | Soft transition or spine warnings — heed but they never block.                                             |

## On each phase change

1. Finish the current phase using the **Steps / Rules** sections above (in this `phase_instructions`).
2. Confirm `done_before_leave`.
3. Call `vindicate_workflow` with **`progress_echo` updated** — add the node you just finished to
   `completed[]`, set the new `node`, and pass `from` when changing phase.
4. Read the **new** `phase_instructions` and **`progress_display.instruction`** for the next phase.

## Branches

Off-spine nodes (e.g. **heal** after a failure) are normal. Update `node`, `from`, and `completed` to
match where you are; the progress checklist expands to show the branch.

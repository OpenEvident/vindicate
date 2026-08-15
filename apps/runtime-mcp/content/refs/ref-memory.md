---
ref: ref-memory
pulled_into: [ground, heal]
note: The .vindicate/ memory layout + locator-reuse sequence. Locators are no longer cached in JSON — recordings are the persistent reusable evidence; live capture and existing page objects are the other reuse sources (D-005, D-014).
---

# Memory lookup (reference)

## Storage layout

All persistent state lives under `.vindicate/` at project root — flat files, committed to git. The MCP
server is stateless (D-005); the generated `.ts` files and recordings are the source of truth.

| File                                     | Shape                    | Purpose                                                                    |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `.vindicate/stories/<feature>.story.md`  | markdown                 | Feature intent, acceptance criteria, scenarios                             |
| `.vindicate/recordings/<safe-name>.json` | `RecordingArtifact`      | A finalized flow: ordered steps + per-element identity + ranked candidates |
| `.vindicate/recordings-index.json`       | `{ version, entries[] }` | Compact index of finalized recordings — read with `browser_record_list`    |
| `.vindicate/config.json`                 | `{ testIdAttribute }`    | Project test-id attribute name                                             |

There is **no locator cache** and no codegen schema persisted under `.vindicate/`. Captured locators are
carried in-context to `design`/`generate`; the durable, reusable record of a flow is its **recording**.

## Locator reuse sequence (stop at first hit)

1. **Existing recordings** — `browser_record_list`, then `browser_record_read`/`browser_record_get`.
   A finalized recording already carries each element's identity (`role`/`name`/`testid`/`tag`) +
   ranked `candidates`; reuse it instead of re-capturing. Prerequisite flows (e.g. auth) are reused
   via `depends_on`.
2. **Grep existing page objects** — `grep -rn "private " pages/*.ts panels/*.ts` for a matching
   field → reuse it; mirror its `// locator-helper:` strategy.
3. **Live capture** — `browser_read` on a miss; confirm ref count = 1. Default includes
   h1–h6/alert/status (`include_verifiable` on). Pass `include_verifiable:false` for scoped or minimal
   re-reads only. Plain non-interactive text (no role/id/testid — an amount, a summary label) is only
   captured on a **scoped** read (`scope:{ref}`/`{css}`); an unscoped read never surfaces it, no matter
   how many times you re-read.

When the product UI source is in the repo (`app_source_found == true`), the agent may read those
source files directly to harvest selector/route hints that feed capture — but this informs in-context
capture, it is not persisted to a memory file.

## Browser session

- Default: **headed** — omit `headless` or pass `headless:false` on `browser_session` create (explore,
  capture, human handoff).
- Pass `headless:true` only when the user or skill explicitly requests unattended/CI-style runs.

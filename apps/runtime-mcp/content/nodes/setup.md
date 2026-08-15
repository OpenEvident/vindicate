---
node: setup
graph: setup
label: Setup
entry_for: [bootstrap, ci]
modes: [bootstrap, ci]
serves: [goal, inputs, steps, tools, rules, output, escalation]
note: Single straightforward skill — gather inputs, scaffold, install, wire CI, smoke. Not split into per-step node calls.
---

# Setup

## Goal

Stand up a new Vindicate Playwright project (and/or wire CI) so the bootstrap completion gate (C15) is
satisfied before any test work. Straightforward and quick — gather a couple of inputs, call
`scaffold_project`, install, wire CI, run one smoke test, confirm. Keep the chat updated at each step.

## Inputs (gather up front, ask only if missing)

- **`BASE_URL`** — the app under test. From the user message, `.env`, or `playwright.config.ts`; ask once via `vindicate_ask_user` only if unknown.
- **`target`** — `ui`, `api`, or `both`. This is a one-time infrastructure decision (what gets scaffolded), separate from the per-feature `layer` choice made later in `understand` for each individual feature. **Decision order:** (1) explicit user choice in chat ("API tests" / "UI tests" / "both" / "end-to-end"), else (2) infer confidently from an unambiguous request (e.g. "test this REST API" → `api`; "test this webpage" → `ui`), else (3) ask once via `vindicate_ask_user` — don't guess between `api` and `both` when the request is genuinely ambiguous, since that decides real infrastructure (browser config, clients vs. page objects) that's awkward to bolt on later. Re-running `scaffold_project` with a broader `target` on an existing project is safe (additive — never clobbers what's already there) if the user wants to add the other layer afterward.
- **`ci_platform`** — required for `scaffold_project`. Allowed: `github`, `bitbucket`. **Decision order:** (1) explicit user choice in chat, else (2) detect from CI files in the **project root only** (`.github/workflows/*.yml` => `github`, `bitbucket-pipelines.yml` => `bitbucket`), else (3) ask once via `vindicate_ask_user`. Never infer CI platform from template/example/docs paths. Do not call `scaffold_project` without a resolved value. CI is required in setup (do not offer "skip CI").
- **`project_dir`** — an **optional relative subdirectory _inside the opened project folder_** (never a parent, sibling, or absolute path). `scaffold_project` always writes relative to the opened folder; omit `project_dir` to scaffold directly into it. Determined by source-code detection (see Step 1) — ask only if the user's intent is unclear.
- **`testIdAttribute`** — scan `src/`/`app/`/`components/` for the dominant test-id attr (`data-testid`/`data-test`/`data-cy`/`data-qa`/`data-automation-id`). Then:
  - **`data-testid` or none found** → do nothing (it is Playwright's default; `getByTestId` already resolves it). Don't ask.
  - **a single non-default attr** → write it to **both** `.vindicate/config.json` (`testIdAttribute`) **and** the `use` block of `playwright.config.ts` (`testIdAttribute: '<attr>'`, same as you write any config file) so generated `getByTestId(...)` resolves it. Then **inform** the user in one line (no question).
  - **multiple competing attrs, or a detected attr that conflicts with an existing config value** → `vindicate_ask_user` to pick the project attribute.
  - Why both files: `getByTestId` is single-valued and only resolves the attr declared in `playwright.config.ts`; `.vindicate/config.json` is what grounding/codegen read.

## Steps

**Mode `bootstrap` (full stand-up):**

1. **Gather inputs** (above). If `playwright.config.ts` already exists, this is already bootstrapped — don't clobber; switch to the relevant `main` path or do a targeted fix only.
   **Source-code detection — opened folder ONLY.** Inspect _only_ the opened project folder (the one `scaffold_project` writes into). List its top level and read its `package.json` if present. **Never `cd` to, list, or reason about parent or sibling directories** — what lives next to the opened folder is irrelevant and inspecting it is the #1 cause of scaffolding into the wrong place. If source files are present **in the opened folder itself** (`src/`, `app/`, a `package.json` that isn't an Vindicate project, framework config like `vite.config.*` / `next.config.*`, etc.), present the user with:
   - **`vindicate-test/` (recommended)** — a dedicated subdirectory of the opened folder, keeping test code separate from application code.
   - **Current directory** — scaffold directly into the opened folder (only if it has no source code of its own).
     Use the chosen value as `project_dir` in the scaffold call. When no source code is found **in the opened folder**, default to it (omit `project_dir`). Either way the project lands inside the opened folder — never beside it.
     **CI choice guardrail.** If root-level signals are missing or conflicting (for example both `.github/workflows/` and `bitbucket-pipelines.yml`, or neither), ask the user which CI they want before calling `scaffold_project`.
2. **Scaffold** — call `scaffold_project` with required `base_url`, `ci_platform`, and `target` (+ optional `project_dir` when a subdir was chosen). It always creates the shared layout (`package.json`, `tsconfig.json`, `playwright.config.ts`, `.env` + `.env.example`, `.gitignore`), plus per `target`:
   - `ui` (default) — `support/config/page-loader.ts`, `support/config/page.config.ts`, `pages/BasePage.ts`, `panels/BasePanel.ts`, and the `pages/ panels/ support/ tests/` directories.
   - `api` — `support/config/client-loader.ts`, `support/config/api.config.ts`, `clients/BaseApiClient.ts`, and the `clients/ builders/ support/ tests/` directories. `playwright.config.ts` omits browser-only config (no `projects`/`devices`) since no browser is ever launched.
   - `both` — everything from both, in one project, sharing `package.json`/`playwright.config.ts`/CI.

   It also writes `.vindicate/config.json` at CWD recording the project root **and the resolved `target`**, so later per-feature `layer` choices only ever offer what this project actually has. **No manual file creation.**

3. **Install** — `npm install` (+ `npx playwright install chromium` only when `target` includes `ui` — an `api`-only project never launches a browser, so skip the browser install entirely). The user or CI may run these; confirm `node_modules/` (+ browsers, if applicable) present.
4. **CI** — `scaffold_project` already emits the CI file for the selected platform: GitHub => `.github/workflows/vindicate-tests.yml` (sharded run + merge-reports via the Vindicate GitHub actions), Bitbucket => `bitbucket-pipelines.yml` (Vindicate Bitbucket pipeline). Don't hand-write the steps. At bootstrap only the `BASE_URL` repo variable is required (GitHub vars / Bitbucket repository variables; optional: `WORKERS`/`RETRIES`). If the API lives on a different host than `BASE_URL` (relevant for `api`/`both`), pass `API_BASE_URL` in `scaffold_project`'s `env_vars` to wire it the same way — it's optional, `api.config.ts` already falls back to `BASE_URL` when unset. Credential secrets are not wired now — they're added later when a test actually reads one (see `generate`). Never put literal credentials in CI files. The GitHub workflow already declares required `permissions`.
5. **Smoke** — `run_tests` to prove the harness reaches `BASE_URL`: the scaffold's own reachability spec(s) (`tests/smoke.spec.ts` for `ui`, `tests/api-smoke.spec.ts` for `api`, both for `both`) run as part of the normal test run — no special-casing which one. `run_tests` only — never terminal/`npx`. **`api-smoke.spec.ts` only proves the host responds** (`status() > 0` — any status, even a 404) — it can't yet assert a real endpoint, since none is grounded at scaffold time. A wrong `BASE_URL`/base-path can still pass this smoke test silently; `generate`'s `leading_slash_path` check (see `ref-api-codegen-schema`) is what actually catches the common cause (an absolute-path `path` dropping a `BASE_URL` base-path segment) once real client methods exist.
6. **Confirm (C15 + audit)** — verify all C15 files/dirs exist; flag any `.js/.jsx/.mjs/.cjs` under `pages/`/`panels/`/`clients/`/`builders/`/`support/`/`tests/` and any forbidden root dirs (`src/ features/ e2e/ specs/ __tests__/`); summarize in 2–3 lines.

**Mode `ci` (CI only, existing project):** do step 4 only (and step 6's CI checks).

## Tools

- `scaffold_project` — creates the layout (the only way; no hand-creation).
- `run_tests` — the smoke run.
- `vindicate_ask_user` — only for a genuinely missing `BASE_URL` or unresolved `ci_platform`.

## Rules

- **`scaffold_project` only** — never hand-create the layout or config files.
- **Never clobber on re-run** — if files exist, diff-and-edit (e.g. `npm pkg set scripts.<name>=...`); never `Write` a full body over an existing `package.json`/`BasePage.ts`/`BaseApiClient.ts`/`page-loader.ts`/`page.config.ts`/`client-loader.ts`/`api.config.ts`/`tsconfig.json`/`playwright.config.ts`/`.env`/`.gitignore`.
- **Stay inside the opened folder** — the project root is always the opened folder; detect, scaffold, and write only within it. Never inspect or target a parent/sibling/absolute path. `project_dir`, when used, is a relative subdirectory of the opened folder and nothing else.
- **No project-named subdir** — never `mkdir <project-name> && cd`; the project root is the opened folder (or the literal `vindicate-test/` subdir when the opened folder has dev code).
- **CI naming [C14]** — for GitHub, filename + top-level `name:` must contain the lowercase `vindicate` token (canonical: `vindicate-tests.yml`, `name: vindicate playwright tests`) and include `permissions: contents: read, actions: write, checks: write`. For Bitbucket, emit `bitbucket-pipelines.yml` from scaffold templates and keep Vindicate pipeline step names intact.
- **All source `.ts`** — no `.mjs/.cjs/.js` in the source tree (C15).
- **`.env` is the only secret source** — `BASE_URL` and creds via `process.env`; `.env.example` holds keys only.

## Output

- A scaffolded, installed, CI-wired project that passes the C15 gate + a green smoke run.
- **Report (chat):** terse — files created (count), `target` scaffolded, smoke result, `BASE_URL` used. No full file-tree dump.
- **Secret hygiene (if any credential was shared this session — pasted in chat or written to `.env`):** add one line telling the user to treat it as exposed — rotate/invalidate it, and keep the live value only in `.env` (gitignored, never committed). Err toward emitting when unsure.
- **Handoff:** bootstrap done → switch to the `main` graph for test work.

## Escalation

- Missing `BASE_URL` after one ask → stop; can't smoke without it.
- Missing `ci_platform` after one ask → stop; `scaffold_project` requires `github` or `bitbucket`.
- `scaffold_project` failure → report the tool error verbatim; do not hand-create files.
- Smoke fails on connection → report the `BASE_URL` tried; likely env/URL, not a test bug.

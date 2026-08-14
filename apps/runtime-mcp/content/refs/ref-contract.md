---
ref: ref-contract
pulled_into: [generate, audit]
note: The conformance contract — every clause vindicate-generated code must satisfy. Adapted from the proven ref-contract: checkpoint/outputSchema framing dropped (D-005); enforcement is now `npm run audit` + the audit node greps (D-004), not runtime validators. Content otherwise preserved.
---

# Contract (reference)

All vindicate-generated code MUST satisfy every clause below. Violating any clause is non-conformance.
The gate is `npm run audit` (`tsc --noEmit`) plus the audit node's grep checklist — not a runtime
validator.

**Severity tags:**
- `[CRITICAL]` — blocks completion. Must resolve before the smoke/audit gate passes.
- `[MAJOR]` — must fix before merging. Auditable via grep.
- `[LOW]` — polish. Acceptable as follow-up.

---

## Clauses

| ID | Rule |
|----|------|
| C1 | Every page class extends `BasePage` (`pages/BasePage.ts`). Panels do NOT extend BasePage — they compose it. |
| C2 | Action methods are `step_<verb>`; assertions are `verify_<thing>`. Both `async`, both return `Promise<this>`. Read getters (`get_*` on page objects, `get<Thing>()` on panels) returning data are exempt from `Promise<this>`. |
| C3 | Specs import `test` from `@config/page.config`. Import from `@config/page-loader` only when schema includes `expected` (as `<featureCamel>Expected`). No deep imports. |
| C4 | `support/config/page-loader.ts` contains only single-line `export … from '…'` statements — no logic, no consts, no path aliases inside the file. |
| C5 | Every page object used in a test is provided as a fixture in `support/config/page.config.ts`. Tests never call `new <Page>(page)`. |
| C6 | Test data is JSON under `support/data/<feature>/`, imported via barrel as the file's own top-level shape. No wrapper objects, no runtime loaders. |
| C7 | Forbidden: custom logger, method decorator, custom `globalSetup`, `authenticatedPage` fixture, `DataLoader` / `CredentialResolver` classes. Generator-managed auth setup via `generates_storage_state` is allowed. |
| C8 | Fixture destructures and function parameter lists stay on a single line — never broken vertically. |
| C9 | The only secret/configuration source is `.env`, read via `process.env.X`. No config wrapper class. |
| C10 | Tests live only in `tests/`. `specs/`, `e2e/`, `__tests__/`, `features/` are forbidden. [CRITICAL] |
| C11 | Typecheck with `npm run audit` (`tsc --noEmit`) — must be clean before any phase closes. |
| C14 | A CI workflow is present after bootstrap for the selected platform (`<project-root>/.github/workflows/vindicate-tests.yml` for GitHub, `<project-root>/bitbucket-pipelines.yml` for Bitbucket). For GitHub, filename and top-level `name:` MUST contain the lowercase `vindicate` token. Job and step `name:` fields are free-form. |
| C15 | Bootstrap completion gate — all of these must exist before any capture, add-feature, or smoke phase begins: `package.json`, `tsconfig.json`, `playwright.config.ts`, `.env`, `.gitignore`, `support/config/page-loader.ts`, `support/config/page.config.ts`, `pages/BasePage.ts`, and directories `support/config/`, `support/data/`, `pages/`, `panels/`, `tests/`. When the project lives in a subdirectory (e.g. `vindicate-test/`), `.vindicate/config.json` at CWD must also exist with `{ "projectRoot": "<subdir>" }`. All vindicate-generated source is `.ts` only — no `.mjs`, `.js`, `.cjs`. |
| C16 | One `test()` per scenario in `.vindicate/stories/<feature>.story.md`, tagged `[AC-x]`. Story file drives count — no cap. Bootstrap smoke spec (1 reachability test) is excluded. |
| C17 | No `tests/<feature>.spec.ts` until (a) C15 satisfied AND (b) a real `<Feature>Page.ts` or panel exists under `pages/` or `panels/` with ≥1 `step_*` and ≥1 `verify_*` AND (c) `npm run audit` passes for that file. `vindicate_generate_code` `create` emits page object + spec atomically and is exempt. [CRITICAL] |
| C18 | Every locator MUST come from the derived structured locator (strategy one of `testid | testid_xpath | dom_id | role_name | label | placeholder | text | attr_combo | scoped | sibling_text | nth`, or `dyn_param`) and carry a `// locator-helper: <strategy>` comment in the source. A locator is normally a `private` field; a runtime-parameterized (`dyn_param`) locator is instead a `private` method returning `Locator`. [CRITICAL] |
| C20 | Every test title starts with exactly one `[AC-x]` tag mapped to an existing AC ID in the linked story file. Format: `test('[AC-1] should <behavior>', ...)`. Tag must be first token. No multi-AC tags. [MAJOR] |
| C21 | After writing all tests, emit one chat line: `✅ AC coverage: N/N covered`, derived from `{ total, covered[], missing[], stale[] }`. |

---

## Root folder allowlist [CRITICAL]

Project root contains **only** these plain directories:
- **Allowed:** `tests/`, `pages/`, `panels/`, `support/`, `test-results/`, `playwright-report/`, `node_modules/`
- **Forbidden:** `src/`, `features/`, `e2e/`, `specs/`, `__tests__/`, `helpers/`, `utils/`, `lib/`,
  `data/` (root — lives under `support/`), `config/` (root — lives under `support/`)

Dotfiles/dotfolders (`.env`, `.gitignore`, `.vindicate/`, `.github/`) are implicitly allowed.

If a rogue folder appears: move contents to `support/config/` (helpers) or `support/data/<feature>/` (test data),
then delete the rogue folder before completion.

---

## Flat structure rules [MAJOR]

- `pages/` and `panels/` are permanently **flat** — no sub-folders, regardless of size.
- `support/config/page-loader.ts` is the only grouping mechanism for page objects, panels, and data.
- `support/data/<feature>/` is the only place where one level of nesting is allowed (one folder per
  feature, no deeper).
- `tests/` MAY use one optional level of section sub-folders (`tests/<section>/<feature>.spec.ts`) for
  large suites — specs resolve page objects via `@`-aliases, so their location is free. `pages/`,
  `panels/`, and `support/data/` stay flat regardless.

---

## Per-folder file-name patterns [CRITICAL]

| Folder | Pattern | Forbidden |
|---|---|---|
| `pages/` | `<PascalCase>Page.ts` | `loginPage.ts`, `login-page.ts`, `Login.ts`, `LoginPage.tsx` |
| `panels/` | `<PascalCase>Panel.ts` | `Header.ts`, `header-panel.ts` |
| `support/data/<feature>/` | lowercase `<noun>.json` | `Users.json`, `user-data.json`, `expected.JSON` |
| `tests/` | `<feature>.spec.ts` | `login.test.ts`, `LoginSpec.ts`, `login_spec.ts` |
| `support/config/` | kebab-case `*.ts` | `pageLoader.ts`, `PageLoader.ts` |
| all source | `*.ts` only | `*.mjs`, `*.cjs`, `*.js`, `*.jsx`, `*.tsx` |

---

## Locator rules

**Locators are derived, not authored [CRITICAL].** Codegen derives each locator from the element's
captured identity (`testid`/`role`/`name`/`tag`) — never hand-written. The agent provides identity, not
selectors. (`browser_read` also derives a uniqueness-verified locator for live acting; codegen derives
its own from the same identity evidence.)

**Selector priority [CRITICAL]. Semantic `getBy*` first; XPath for attribute/id/positional; never CSS.**

- Tier order: `testid` (`getByTestId`) → `testid_xpath` (`//*[@attr]`) → `dom_id` (`//*[@id]`) →
  `role_name` (`getByRole` exact) → `label`/`placeholder`/`text` → `attr_combo` (`//tag[@a][@b]`) →
  `scoped` (container `getByRole().getByRole()`) → `sibling_text` (`//tag[preceding-sibling::*[…] or
  following-sibling::*[…]]`, only when no accessible name exists at all) → `nth` (positional, low
  confidence).
- A `dyn_param` locator is a **method** with a `${param}` template literal when a specific runtime value
  must be targeted (the only place parameterization sits over the derived locator).
- **Iframe-scoped elements** — `browser_read`/codegen resolve through `<iframe>` boundaries (same-origin
  or cross-origin) automatically; a captured element inside one carries `frame_path`, rendered as
  `this.page.frameLocator('xpath=…').frameLocator('xpath=…').getByRole(…)` — one `.frameLocator()` hop
  per nesting level, then the element's own tier as normal. This is **scoping, not an alternate
  matching strategy**, so it does not count against "one strategy per element" below. Never hand-author
  a `frameLocator()` chain — it comes only from a captured `locator.frame_path`, same as every other tier.
- **Forbidden globally [CRITICAL]:** CSS selectors (any form — `[attr=…]`, `.class`, `#id`),
  `.or(...)` chains. Semantic `getBy*` and XPath are both allowed.
- **One strategy per element [MAJOR].** Each `private` locator field uses exactly one selector — no
  `.or(...)`, no comma unions, no fallback patterns.
- **Uniqueness [CRITICAL].** Every locator must resolve to exactly 1 element. Verify via snapshot ref
  count. Never use `.filter()`, `.first()`, `.nth()`, `.last()` as uniqueness workarounds.
- **Locator field naming:** `private`, camelCase, suffix matches element kind — `usernameInput`,
  `loginButton`, `errorMessage`, `forgotPasswordLink`. A `dyn_param` locator is a `private` method with
  the same naming.
- **Bundled locator block [MAJOR].** All locator fields/methods are contiguous — no blank lines between
  them (a `dyn_param` method body is part of the block).
- **Dynamic locators [MAJOR].** A `dyn_param` locator must take its runtime value as a method parameter
  and interpolate it via a `${param}` template literal — never concatenate or hardcode the value. Callers
  pass it through a `step_*`/`verify_*` param (codegen: `refArgs`).
- **Optional elements [MAJOR].** Elements that may be absent are clicked via `clickIfVisible` (codegen
  `click_if_visible`), never an unconditional click. Any conditional logic lives in a page-object method,
  never in the spec body.

**Visual diagnosis (agent tools) [MAJOR]**
- `browser_diagnose` is **fallback-only** — call only after `browser_read` on the same session when you
  still cannot locate or act on the target.
- **Diagnosis only** — use the screenshot to understand *why* you are stuck (modal, disabled control,
  missing prior step). **Never** use it to invent or author selectors.
- **One shot per stuck-point** — do not spam screenshots; re-read scoped or escalate instead.
- **Big pages:** when `browser_read` shows `⚠️ showing N of M elements`, scope the next read before
  diagnosing or escalating.

**Standalone debug scripts (agent tooling) [MAJOR]**
- Some questions a live `browser_read`/`browser_act` loop cannot answer at all — the real HTTP status
  behind a "timeout" (409 vs a genuine hang), the exact values inside a third-party widget (picker
  columns, a rich-text editor's DOM shape), whether two same-labeled elements really collide. For
  those, a one-off Node/Playwright script run **outside** the project directory (never under `pages/`,
  `panels/`, `support/`, or `tests/` — the `*.ts`-only rule above governs project source; a debug
  script is not project source) is faster and more conclusive than guessing through repeated
  `browser_act` retries.
- **One question, one script, one run — then delete it.** Don't let an unresolved hypothesis spawn a
  second or third script; if the first run doesn't answer the question, stop and escalate
  (`vindicate_ask_user`) instead of iterating. This is the same one-shot discipline as `browser_diagnose`
  above, applied to code instead of screenshots.
- **Diagnosis only — never authored into the deliverable [CRITICAL].** The script itself never becomes
  part of `tests/`/`pages/`/`panels/`; only the *finding* (e.g. "scope to the open modal", "use
  `pressSequentially`, not `fill`, for this editor", "slots collide — randomize / retry with a fresh
  one") gets hand-written into the real `.ts` file.
- **Always deleted before reporting done** — confirm with a working-tree check (e.g. `git status`)
  that no leftover `.mjs`/`.js`/debug file survives anywhere in the repo.

---

## Page object rules [MAJOR]

- **1:1 class-to-page.** One `<X>Page.ts` file = one class = one web page. Additional classes in the
  same file are forbidden. Helper types (e.g. `LoginCredentials`) may co-locate.
- **Method block order:** locators → `step_*` → `verify_*`. One blank line between groups.
- **JSDoc on every public method [MAJOR].** Each `step_*`, `verify_*`, `get_*` (pages) and `step_*`,
  `verify_*`, `get<Thing>()` (panels) requires a `/** */` block with: one-line imperative summary
  ≤80 chars, `@param` for each parameter, `@returns`.
  Detection grep: `awk '/^\s+async (step_|verify_|get_|get[A-Z])/{ if (prev !~ /\*\//) print FILENAME":"NR": missing JSDoc" } { prev = $0 }' pages/*.ts panels/*.ts`
- **Panels are composed, not extended.** Held on a page object as
  `readonly headerPanel = new HeaderPanel(this.page)`.
- **Panel getter naming.** User interactions: `step_*` / `verify_*`. Pure getters: `get<Thing>()`
  camelCase, no underscore.
- **Always `await` Playwright calls.** `.then(...)` is forbidden.

---

## Browser actions (live + generated)

Short `browser_act` verbs map to worker actions (`select`→`select_option`, `scroll`→`scroll_by`,
`press`→`press_key`, `upload`→`upload_file`). Recorded artifacts use **worker names** (`fill`, `drag`,
`dblclick`, `upload_file`).

| Action | When to use | Notes |
|--------|-------------|-------|
| `fill` | Set a value on text, number, textarea, contenteditable, **range** | Default for value-set. Replaces existing value. Not for checkbox/radio/file — use `check`/`uncheck`/`upload`. Falls back to filling a single native `<input>`/`<textarea>`/contenteditable descendant when the resolved element is itself a non-editable wrapper (e.g. `<ion-input>`) — no extra step needed. |
| `type` | Keystroke-sensitive fields (masked PIN, some OTP widgets); **JS-model rich-text editors (Quill, Slate, TinyMCE)** whose internal state only updates from real keystroke events — `fill` silently no-ops on these even though the element is contenteditable | Character-by-character; use sparingly. |
| `hover` | Reveal menus, tooltips, lazy dropdowns before click | Not recorded in human artifacts (drive-only). |
| `dblclick` | Double-click to open/edit | Recorded as `dblclick`. |
| `drag` | Pointer drag source → `to_ref` target | `strategy:"manual"` (default) or `"native"` for HTML5 DnD. Codegen emits `dragTo()`. |
| `upload` | `<input type="file">` | Exploration: `sample` kind or absolute `files` on worker. Tests: `support/data/<feature>/…` paths. |

---

## Spec rules

- **No logic in test body [CRITICAL].** Forbidden inside `test()`: `if`, `throw`, `try/catch`, `for`,
  `while`, env-var checks. Test body is a flat sequential list of `step_*` / `verify_*` calls.
  Detection grep: `grep -nE '^\s+(if |throw |try \{|for \(|while \()' tests/**/*.spec.ts`
- **No blank lines within test body.** Sequential calls are contiguous. Only blank line allowed inside
  a describe is between adjacent `test()` blocks.
- **Test name pattern.** `'[AC-x] should <present-tense-verb> <observable outcome>'` — full title
  ≤60 chars including the `[AC-x]` prefix. No snake_case, no `it should`, no implementation detail.
- **Exactly 2 imports.** `test` from `@config/page.config` and barrel from `@config/page-loader`. No
  relative paths, no deep imports.
- **Single-line fixture destructure** — never broken vertically (C8).
- **No `expect()` directly in spec body** — all assertions go through `verify_*` methods.

---

## 7-token naming rule [CRITICAL]

For feature noun `<x>` (lowercase, all 7 tokens derived from the same noun unchanged):
1. Story file: `.vindicate/stories/<x>.story.md` ← canonical source
2. Data folder: `support/data/<x>/`
3. Page class + file: `<X>Page` in `pages/<X>Page.ts`
4. Fixture key: `<x>Page`
5. Barrel export: `<x>Expected`
6. Spec file: `tests/<x>.spec.ts`
7. Describe title: `'<App> - <X>'`

Synonym drift, singular/plural drift, and casing drift across tokens are non-conformance.
Audit grep: `grep -rn "<X>Page\|<x>Page\|<x>Expected\|<x>\.spec\.ts" pages panels support tests`.

---

## Anti-patterns

- **Spec location [CRITICAL].** Tests must live under `tests/`. Any spec outside `tests/` (e.g.
  `features/`, `e2e/`, project root) is a wrong-location violation.
- **Traceability comments [CRITICAL].** Every spec starts with
  `// spec: .vindicate/stories/<feature>.story.md` (top of file); every test has `// scenario: <name>`
  before it.
- **Story ↔ spec sync [MAJOR].** Story is source of truth for test count. When a spec changes (tests
  added/removed/renamed), update the linked story: AC-n lines, `## … [AC-n]` testcase headings, and
  `[FA-x-y]` Feature bullets. Spec test count must equal story AC count. FA tags stay stable when
  renumbering ACs.
- **Missing or misplaced `[AC-x]` tags [MAJOR].** Tag must be first token. Multi-AC tags
  (`[AC-1][AC-2]`) are forbidden. Missing or trailing tags are hard failures.
- **Coverage is derived at runtime [MAJOR].** Compute coverage from stories + specs on demand; never
  write it to a `coverage_inventory.md` file.
- **Assumption-based locator drafting [CRITICAL].** Every `private` locator field must come from a live
  snapshot capture or a valid cache hit. Invented selectors without DOM evidence block completion.

---

## Decision reference

| Question | Answer |
|---|---|
| `BasePage` or page object? | `BasePage` only for selector-agnostic utilities used by every page. |
| Page or panel? | Pages own URLs and lifecycles. Panels own a reusable DOM region on multiple pages. |
| New data — type, JSON, or barrel? | Test data → JSON. Tiny shape used by one page → exported `type` co-located. Never wrap JSON. |
| Need to log in? | Default: inline via `loginPage.step_login(...)`. Generator-managed auth setup (`generates_storage_state` / `storage_state`) is allowed when explicitly requested. |
| Want collapsible reporter steps? | `await test.step('label', async () => { ... })`. Never a method decorator. |
| New env var? | Add to `.env` (values) and `.env.example` (keys only, no secret values). Read via `process.env.X`. No config wrapper class. |
| Assert something not on a page object? | Add a `verify_*` method first. No bare `expect()` in spec. |
| Fixture list feels long? | The test does too much — split it. Never wrap or aggregate fixtures. |

---
node: generate
graph: main
label: Generate
entry_for: []
modes: [create, add_test_cases, register_page, direct-edit, create_api, add_api_test_cases, register_client]
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation, mode-slice]
refs: [ref-page-object, ref-contract, ref-recipes]
refs.create: [ref-codegen-schema]
refs.add_test_cases: [ref-codegen-schema]
refs.register_page: [ref-codegen-schema]
refs.create_api: [ref-api-codegen-schema]
refs.add_api_test_cases: [ref-api-codegen-schema]
refs.register_client: [ref-api-codegen-schema]
---

# Generate

> **Appended references (read them — they carry the load-bearing detail).** The always-appended refs come
> first; the codegen-schema refs are appended **last and only for the matching codegen operations**
> (`create` / `add_test_cases` / `register_page` → `ref-codegen-schema`; `create_api` /
> `add_api_test_cases` / `register_client` → `ref-api-codegen-schema`) — a `direct-edit` builds no
> schema, so it isn't served either ref:
> [`ref-page-object`](../refs/ref-page-object.md) — page-object anatomy + the canonical `.ts` template;
> [`ref-contract`](../refs/ref-contract.md) — every conformance clause;
> [`ref-recipes`](../refs/ref-recipes.md) — worked patterns for optional/ad-hoc UI, dynamic
> (runtime-parameterized) locators, and advanced widgets (calendars/date pickers);
> [`ref-codegen-schema`](../refs/ref-codegen-schema.md) — the full UI `vindicate_generate_code` input
> shape, the validate error codes, the BodyCall expression table, and a **worked auth-login JSON
> example** (shape reference when ground saw a submit XHR — not a default for every login; pick waits
> from ground evidence per *Submit timing*);
> [`ref-api-codegen-schema`](../refs/ref-api-codegen-schema.md) — the API-layer input shape (client
> methods, builders, the token-once auth-setup pattern, inline assertions) and a worked example. The
> summaries below are the working rules; the refs are the source of truth and examples.

## Goal
Turn the approved plan + grounded evidence into **conformant test code** — page objects for a `ui`
feature, resource clients for an `api` feature, both for a `hybrid` one (grounded independently,
combined via direct-edit — see *Hybrid features* below). New features and new test cases go through
`vindicate_generate_code` (it wires everything and guarantees structure); all other changes are
**direct TypeScript edits** following the conventions. The files are the source of truth — there is
no schema to keep in sync, and nothing regenerates over your edits.

## Inputs
- Approved `TestDesign` (write plan, `[AC-n]` test titles, **layer**: `ui`/`api`/`hybrid`).
- `ui`/`hybrid`: captured element identities with strategy markers from `ground` (carried in-context, or from a finalized recording).
- `api`/`hybrid`: captured endpoint records + auth mechanism from `ground`'s `api-ingest` mode (carried in-context).
- Approved story (for `[AC-n]` + scenario names).
- Existing page objects/clients / specs / `page-loader.ts` / `page.config.ts` / `client-loader.ts` / `api.config.ts` (DRY + direct edits).

## Steps
1. **Pick the operation** (see Decision rules), per the story's `layer`:
   - `ui` — new feature/spec → **create**; new cases → **add_test_cases**; new page → **register_page**.
   - `api` — new feature/spec → **create_api**; new cases → **add_api_test_cases**; new resource → **register_client**.
   - `hybrid` — run the `ui` and `api` ops independently (two separate `create`/`create_api` calls,
     each wiring its own fixtures), then a **direct-edit** to combine steps from both fixture sets
     into one spec case where the story actually needs a single mixed test (see *Hybrid features*).
   - Any layer, existing code — change a locator/method/assertion/step, delete a test, restructure → **direct `.ts` edit**.
2. **DRY check** — reuse existing page objects/clients, fixtures, and locators/methods (grep `page-loader.ts`/`client-loader.ts`); only create what's genuinely new.
3. **Build the scenario → AC map** from the story; fix story headings first if any lack `[AC-n]`.
4. **For `create`/`create_api`:** build the schema input, **validate first** (`mode:'validate'`/`'validate_api'`, `validateTarget:'create'`/`'create_api'`), fix **every** error in `errors[]` (each has `code`/`path`/`message`/`fix`/`example`), re-validate until clean, then run the real op. (`add_test_cases`/`add_api_test_cases`/`register_page`/`register_client` have no dry-run — write, then `npm run audit`.)
5. **For direct edits:** edit the TypeScript directly, following the rules below and mirroring existing files. Use the spec edit patterns (append a `test()` inside an existing describe; add a new describe; new file only when it doesn't exist).
6. **Run `npm run audit`** (`tsc --noEmit`); fix every type error before finishing.
7. **Emit AC coverage** — one chat line: `✅ AC coverage: N/N covered`.

## Decision rules — codegen vs direct edit
- **`create`** — a new UI feature/spec. Wires everything: page object(s), `page-loader.ts` exports, `page.config.ts` fixture (import + type + impl), spec, `expected.json`, `auth.setup.ts`. **Always use `create` for a new UI spec.**
- **`create_api`** — a new API feature/spec. Wires everything: resource client(s), `client-loader.ts` exports, `api.config.ts` fixture(s) (+ worker-scoped auth fixtures when `auth_setup` is present), spec, `expected.json`. **Always use `create_api` for a new API spec.**
- **Never re-run `create`/`create_api` on an existing feature** — it regenerates the whole feature and clobbers hand-edits. Both **refuse** if the feature's spec or page objects/clients already exist (pass `overwrite:true` only to deliberately regenerate from scratch). Once per feature.
- **`add_test_cases`/`add_api_test_cases`** — append new `test()` block(s) to an existing spec (structurally significant: `[AC-n]` title, fixtures, expected refs).
- **`register_page`/`register_client`** — add a brand-new page object / resource client to an existing feature (generates the file + wires only its barrel/config lines; additive, no clobber).
- **Direct `.ts` edit** — everything else: change a locator/method line, tweak a step body, fix an assertion, delete a test, restructure, or combine UI+API steps into one hybrid test. The agent reads the existing file and edits surgically. `npm run audit` is the backstop.

## Hybrid features (`layer: hybrid`)
Codegen never produces a single spec that mixes UI actions and API calls in one call — `create`/`create_api` each stay single-layer. A hybrid scenario (seed via an API client, drive the UI, assert via the API) is: run `create`/`create_api` independently for whichever layer(s) are genuinely new, then **direct-edit** the resulting spec to destructure fixtures from both `page.config.ts` and `api.config.ts` in the same test — Playwright merges fixtures from both without any special wiring (the same pattern `vindicate-api`'s own `secondApiRequest`/`usersApi` demonstrates for a second API host). Keep this to the specific tests that genuinely need both; most features are cleanly one layer or the other.

## Tools
- `vindicate_generate_code` — UI modes `create`, `add_test_cases`, `register_page`, `validate`; API modes `create_api`, `add_api_test_cases`, `register_client`, `validate_api`.
- Direct file edits — the agent's native edit/write (for the direct-edit operation, including combining layers for a hybrid test). Not an Vindicate tool.
- (`run_tests` is NOT used here — that's `execute`.)

## Rules — UI (conventions for both codegen and direct edits)
- **Page object** (`pages/<Feature>Page.ts`, one class per web page, extends `BasePage`): block order locators → `step_*` → `verify_*`, one blank line between groups; locator block contiguous (no blank lines inside); each `private` camelCase locator has a `// locator-helper: <strategy>` comment; `step_*`/`verify_*` are `async`, return `Promise<this>`; `get_*` returns a value; JSDoc on every public method (one-line imperative summary + `@param` + `@returns`). Panels compose (`readonly headerPanel = new HeaderPanel(this.page)`), don't extend BasePage.
- **Locators** — same derived-locator protocol as `ground`; never invent (codegen derives from the captured identity evidence — `testid`/`role`/`name`); one strategy per element; forbidden: CSS selectors, `.or()`, `.filter()/.first()/.nth()/.last()`. Semantic `getBy*` and XPath are both allowed. **This includes `frameLocator()`'s own selector argument** — it takes `xpath=...`, never a bare CSS attribute selector, on a hand-edit exactly as much as on codegen output:
  - Correct: `this.page.frameLocator('xpath=//*[@id="klarna-checkout-iframe"]')`
  - Forbidden: `this.page.frameLocator('iframe[id="klarna-checkout-iframe"]')`
- **Live-region locators (alert / status / log)** — these roles take their accessible name from author markup, not content. **Never** `getByRole('alert', { name: '<message text>' })` — it matches nothing. Locate by role only (`getByRole('alert')`) and assert the message with a `verify_*` `toContainText`. Applies to hand-written `.ts` edits too, not just generated code.
- **Dynamic / conditional / widgets (see [`ref-recipes`](../refs/ref-recipes.md)):** for a selector with a runtime value (`delete-product-{id}`, a date cell) declare the element `dynamic` with `{param}` placeholders + pass `refArgs` (codegen emits a `dyn_param` locator method); for UI that may be absent use `click_if_visible` (never an unconditional click); for advanced widgets (calendars/date pickers) model the widget as a Panel, make the per-item target a `dyn_param` method, compute relative dates and put any loop/branch **inside the page/panel method** — never the spec.
- **Waits / synchronization** — put explicit waits **inside the page-object step**, never the spec:
  - **After `navigate`** — follow `{ "do": "navigate" }` with `{ "do": "waitForPageLoad" }` (emits `await this.waitForPageLoad()` → `page.waitForLoadState('domcontentloaded')`). Use in every `step_navigate`; it does **not** wait for XHR or URL changes.
  - **After submit / click that triggers async work** — pick **one wait from ground evidence**, inside the page-object step (never the spec):
    - Submit fires an **XHR** (any flow: login, search, save, …) → `waitForResponse` with `urlPattern` from `observed_endpoints` (ground must capture the path first).
    - Submit is **redirect-only** (URL changes, no XHR) → `waitForURL` on the post-submit route; no `observed_endpoints`.
    - **Not every login** needs `waitForResponse` — use it only when ground saw a submit XHR. Validation rejects `waitForResponse` without `observed_endpoints` or doc-copied paths. **Do not** use `waitForPageLoad` after submit. (See `ref-codegen-schema` → *Submit timing*.)
  - **URL assertions (`toHaveURL`)** — use exact path strings (`"'/path'"`) or regex (`"/segment\\/path/"`); never invalid globs like `"**/path**"`. Globs belong on `waitForURL` step actions when needed (`**/segment/path`).
- **Spec** (`tests/<feature>.spec.ts`): top `// spec: .vindicate/stories/<feature>.story.md`; **exactly 2 imports** — `test` from `@config/page.config`, barrel from `@config/page-loader`; `// scenario: <name>` before each test; title `'[AC-n] should <verb> <outcome>'` (≤60 chars, `[AC-n]` first token); **no logic in the body** (no `if`/`throw`/`try`/`for`/`while`/env checks); **no bare `expect()`** (all assertions via `verify_*`); single-line fixture destructure; no blank lines between sequential `step_*`/`verify_*` calls.
- **Data** — test data is JSON under `support/data/<feature>/`, top-level keys only (no wrapper objects); `expected.json` from the schema's top-level `expected`; reference as `expected.key`. **Required** for invalid inputs, fixed error strings/regex, shared assertion data. Secrets/credentials come **only** from `.env` via `process.env.X!` (never in `expected`, never baked into a `fill`/`select` value). **When a test reads a new `process.env.X` secret, also wire it for CI using the active platform file:** GitHub => add `X: ${{ secrets.X }}` to `run-tests` `env:` in `.github/workflows/vindicate-tests.yml`; Bitbucket => expose `X` as a secured repository variable used by `bitbucket-pipelines.yml`. Tell the user to set the corresponding CI secret/variable `X` (never a literal value). **File uploads:** commit fixtures under `support/data/<feature>/` and emit `setInputFiles(['support/data/<feature>/<file>'])` — project-root-relative, never absolute paths.
- **7-token naming** — feature noun `<x>` used unchanged across story, `support/data/<x>/`, `<X>Page`/`<X>Page.ts`, fixture `<x>Page`, barrel `<x>Expected`, `tests/<x>.spec.ts`, describe `'<App> - <X>'`.
- **Tests live only in `tests/`.** Barrel `page-loader.ts` is single-line exports only. Fixtures provided in `page.config.ts` — never `new <Page>()` in a test.
- **Forbidden (anti-patterns):** custom logger, method decorators, `globalSetup` pre-auth, `DataLoader`/`CredentialResolver` classes, `authenticatedPage` fixture, wrapper interfaces over JSON, `@data/*` alias, empty stub files, non-`.ts` source files, probe/exploration scripts.
- **C17 gate:** no `tests/<feature>.spec.ts` until a real `<Feature>Page.ts` (≥1 `step_*` + ≥1 `verify_*`) exists and audits clean. `create` emits both atomically and satisfies this.

## Rules — API (conventions for both codegen and direct edits)
- **Resource client** (`clients/<Resource>Client.ts`, **one file per resource, always** — never combine two resources into one file even if small): extends `BaseApiClient`; one method per HTTP action, method names read like the resource's verb (`create`, `getById`, `delete`), not the raw HTTP method; every method takes an optional trailing `headers?: Record<string, string>` for a per-call override; JSDoc only where the method name alone doesn't make the call obvious.
- **Payload builder** (`builders/<Resource>PayloadBuilder.ts`, only for a resource with a write body): fluent `.withX()` chain over sensible `defaultPayload` values, one `.build()` method. Skip entirely for a read-only resource.
- **Assertions are inline in the spec body** — `expect(response.status()).toBe(201)` — **never** routed through a `verify_*`-style method. This is the opposite convention from UI on purpose: matches the fixed `vindicate-api` reference template ("what's being checked is visible without a detour through a helper").
- **Auth: token-once, never per-test.** When the feature needs a login step, wire it as `create_api`'s `auth_setup` (worker-scoped fixtures — log in once per worker, share the token) — never a per-test login call. See `ref-api-codegen-schema` → *Auth setup*.
- **Spec** (`tests/<feature>.api.spec.ts` — the `.api.` suffix avoids colliding with a `ui`-layer spec of the same feature in a `both`-scaffolded project): top `// spec: .vindicate/stories/<feature>.story.md`; imports from `@config/api.config` (test + expect) and `@config/client-loader` (barrel, if the case bodies need direct type references); `// scenario: <name>` before each test; title `'[AC-n] should <verb> <outcome>'` (validated: `title` must start with `[<ac_id>]`).
- **API naming** — the API-layer counterpart to UI's "7-token naming" above, not a contradiction of it: feature noun `<x>` unchanged across story, `support/data/<x>/`, `<X>Client`/`clients/<X>Client.ts`, `tests/<x>.api.spec.ts` (the `.api.` suffix is the one deliberate deviation, explained above), describe `'<App> - <X>'` (e.g. `"Acme - Posts"`, see `ref-api-codegen-schema`'s worked example).
- **Data** — same `support/data/<feature>/expected.json` convention as UI, for fixed/negative-path values (a known-invalid id, an exact error string). Secrets **only** from `.env` via `process.env.X!`, wired to CI the same way as UI (see the Data rule above).
- **Forbidden (anti-patterns):** raw `fetch`/`axios`/`node-fetch` (always Playwright's own `request` — see `api_request`'s own rationale in `ground`), a shared mutable client instance reused across tests without going through a fixture, hardcoded tokens/credentials anywhere but `.env`.
- **C17-equivalent gate:** no `tests/<feature>.api.spec.ts` until a real `<Resource>Client.ts` (≥1 method) exists and audits clean. `create_api` emits both atomically and satisfies this.

## Mode slices

### create (new feature)
Build the full schema (pages + elements + steps + verifies + spec + `expected`), `validate` (`validateTarget:'create'`), fix all errors, then `create`. For large features (3+ pages / 20+ elements) build progressively: create a minimal shell first, then `register_page` per additional page, `add_test_cases` last.

### add_test_cases (new cases, existing spec)
Provide the case bodies (fixture, calls, args, `[AC-n]`, scenario). Codegen appends before the describe close. No dry-run — `npm run audit` (`tsc`) after the write catches any missing method / wrong arg count with the exact location.

### register_page (new page, existing feature)
Provide the one page's definition (elements/steps/verifies). Codegen writes the page object + wires its `page-loader`/`page.config` lines only. Does not touch existing files.

### create_api (new API feature)
Build the full schema (clients + methods + spec + optional `builders`/`auth_setup`/`expected`), `validate_api` (`validateTarget:'create_api'`), fix all errors, then `create_api`. For large features (3+ resources) build progressively: create a minimal shell first, then `register_client` per additional resource, `add_api_test_cases` last.

### add_api_test_cases (new cases, existing API spec)
Provide the case bodies (fixture, method, args, assertions, `[AC-n]`, scenario). Codegen appends before the describe close. No dry-run — `npm run audit` (`tsc`) after the write catches any missing method / wrong arg count with the exact location.

### register_client (new resource, existing API feature)
Provide the one resource client's definition (types/methods). Codegen writes the client + wires its `client-loader`/`api.config` lines only. Does not touch existing files.

### direct-edit (everything else)
Read the target `.ts`; make the surgical change following the conventions above; rely on `npm run audit`. Spec edit patterns: append a `test()` inside the existing describe (Edit, unique anchor = last `verify_*` line, or the last assertion + `});`, for API specs); add a new `test.describe`; new file only when it doesn't exist. Also where a hybrid test combining UI and API fixtures gets hand-written (see *Hybrid features*).

## Output
- Files written/edited (page objects/resource clients, spec, barrels, data) — conformant + audit-clean.
- **Report (chat):** files touched + `✅ AC coverage: N/N covered`.

## Transitions
- files written/edited and `npm run audit` is clean → **execute**

## Escalation
- `validate`/`validate_api` returns errors → fix all before the real op; do not retry `create`/`create_api` in a loop.
- `create`/`create_api` itself returns `schema_validation`/`structural_check` → fix the named field/path in
  the schema JSON and retry the **same** `vindicate_generate_code` call. **Never fall back to hand-writing the
  page/client/spec/fixture files instead** — even after repeated failures. `create`/`create_api` wire
  barrels, config fixtures, and `expected.json` atomically and satisfy the C17 gate; a direct file write on
  a feature that doesn't exist yet will silently violate both.
- `npm run audit` fails → fix the type errors before advancing.
- C17 (or its API-equivalent) prerequisites missing → stop; report the missing page-object/resource-client prerequisite.

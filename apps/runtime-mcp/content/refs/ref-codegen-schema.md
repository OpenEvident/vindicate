---
ref: ref-codegen-schema
pulled_into: [generate]
note: Canonical input shape + examples for vindicate_generate_code. Adapted to the 4-op surface (D-015) — the 7 patch modes and the persisted .vindicate/schemas/ store are removed. This is appended to the `generate` node so the agent never has to guess the schema.
---

# Codegen schema (reference)

Canonical shape for `vindicate_generate_code`. **The files are the source of truth:** `create` generates a
conformant scaffold once; after that the `.ts` files are authoritative. The schema is only an **input
contract** for the ops below — nothing is persisted or read back.

## Top-level

- `mode: "validate" | "create" | "add_test_cases" | "register_page"`
- `validateTarget`: required when `mode:'validate'` — **only `"create"`** is supported. `add_test_cases`
  and `register_page` have no dry-run (there is no schema to cross-check); their gate is `npm run audit`
  (`tsc`) after the write.
- `feature: string` — the feature slug (lowercase noun; drives 7-token naming).
- `overwrite?: boolean` — only honored by `create` (see the guard below).
- `observed_endpoints?: string[]` — URL path substrings from `ground` when a submit fires an XHR (login,
  search, save, etc.). **Required** only when a step uses `waitForResponse`; omit for redirect-only
  submits (`waitForURL` instead). Each `urlPattern` must match an entry here.

**Workflow:** for a new feature, `validate` (target `create`) → fix every `errors[]` entry → `create`.
`validate` writes no files. **`create` refuses if the feature already exists** (its spec or any of its
page objects are present) unless you pass `overwrite: true` — so a stray `create` can never clobber
hand-edited files. Add a page → `register_page`; add tests → `add_test_cases`; anything else → direct
`.ts` edit.

| Op               | Input                                                | Effect                                                                                                                                          | Re-runnable?                                              |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `create`         | inline `schema` (pages + spec + optional `expected`) | Generates the whole feature fresh: page objects, `page-loader.ts` exports, `page.config.ts` fixtures, spec, `expected.json`, `auth.setup.ts`    | **No** — once per feature; re-running clobbers hand edits |
| `add_test_cases` | `cases[]`                                            | Appends new `test()` blocks before the describe close (does not regenerate)                                                                     | Yes                                                       |
| `register_page`  | one `page` def                                       | Generates that one page object + wires **only** its `page-loader.ts` / `page.config.ts` lines (anchor-insertion); never rewrites existing files | Yes (additive)                                            |
| `validate`       | `validateTarget:'create'` + the `create` schema      | Dry-run for `create` only; returns `errors[]`, writes nothing                                                                                   | Yes                                                       |

> Everything else (change a locator/step/assertion, delete a test, refactor) is a **direct `.ts`
> edit** — not a codegen op. `npm run audit` (`tsc --noEmit`) + the audit node are the backstop.

## Validate response

```json
{
  "ok": true,
  "valid": false,
  "errorCount": 2,
  "truncated": false,
  "errors": [
    {
      "code": "fill_value_param_exclusive",
      "path": "pages[0].steps[1].actions[0]",
      "message": "fill action has both value and param",
      "fix": "Provide exactly one of value (literal) or param (step param name).",
      "example": "{ \"do\": \"fill\", \"ref\": \"emailInput\", \"param\": \"email\" }"
    }
  ]
}
```

Each error has `code`, `path`, `message`, `fix`, and (often) `example`. **Fix every error before the
real op; never retry the real op in a loop.**

Common `code` values: `schema_shape`, `owned_by_mismatch`, `duplicate_element_ref`,
`field_name_collision`, `ghost_element_ref`, `fill_value_param_exclusive`, `unknown_step_param`,
`duplicate_step_name`, `duplicate_verify_name`, `duplicate_ac_id`, `invalid_assertion_arg`,
`invalid_body_call_arg`, `quoted_env_var_arg`, `secret_in_step_value`, `expected_block_missing`,
`unknown_expected_key`, `empty_expected_block`, `duplicate_expected_value`, `use_expected_for_test_data`, `inline_test_data_with_expected_block`, `locator_missing`, `panel_has_path`,
`page_missing_path`, `unknown_fixture`, `unknown_body_call`, `body_call_arg_count`,
`dynamic_placeholder_mismatch`, `dynamic_ref_args`, `waitforresponse_missing_observed`,
`waitforresponse_unobserved_endpoint`, `waitforresponse_doc_placeholder`, `malformed_url_glob`.

## `create` schema

- `pages[]`:
  - `feature`, `page_class`, `owned_by`
  - `owned_by`: the feature slug that owns this page (example: `"auth"`). Must equal the create
    `feature` for every page referenced by spec fixtures. **Not** the Playwright fixture name.
  - `path` required unless `is_panel: true`
  - `is_panel?: boolean` — panels have no `path` and are composed, not extended (see ref-page-object).
  - `elements[]`: `{ ref, tag, testid?, testid_attr?, role?, name?, type? }` — **`ref`** is the wire
    name for actions/assertions. When `testid` and `name` are omitted, a camelCase `ref` (not a
    placeholder like `e1`) becomes the generated `private` field name; otherwise the field is derived
    from `testid`, then `name`, then `role`/`tag`.
  - `types[]`: `{ name, fields[] }`
  - `steps[]`: `{ name: step_*, jsdoc, params[], actions[] }`
  - `verifies[]`: `{ name: verify_*, jsdoc, params[], assertions[] }`
- `observed_endpoints?`: string[] — URL path substrings from `ground` submit XHRs. **Required** when
  any step action is `{ "do": "waitForResponse", ... }`; each `urlPattern` must match one entry.
- `expected?`: object — **required** when any case uses invalid/fixed test inputs or shared assertion
  strings/regex. Codegen writes `support/data/<feature>/expected.json` and imports `<featureCamel>Expected`
  in spec and page objects. Keys are plain JSON values. **Never** put secrets or env-backed credentials
  here. **Omit** `expected` entirely when all args are `process.env.*!` — do not pass an empty `{}`.
- `spec`:
  - `suite`
  - `generates_storage_state: string | null`
  - `storage_state: string | null`
  - `before_each: BodyCall[] | null`
  - `cases[]`: `{ ac_id, scenario, title, body[] }` — **all four required**, including `title` (the
    literal `test()` title, `[AC-n] should …`, ≤60 chars) alongside `scenario` (the short human label
    used only in the design panel). `pages[].types` is also required — pass `[]` when the page defines
    no custom types.

## `register_page` schema

`{ feature, page: <one page object as in pages[] above> }`. Generates `pages/<PageClass>.ts`
and inserts **only** that page's `export … from` line in `page-loader.ts` and its fixture
(import + type + impl) in `page.config.ts`. Existing files are untouched. Use this — never `create`, never
hand-wiring — to add a page to an existing feature.

## `add_test_cases` schema

`{ feature, cases: TestCase[] }`. Each case: `{ ac_id, scenario, body: BodyCall[] }`. Codegen appends
the `test()` block(s) before the describe close. No dry-run — after writing, `npm run audit` (`tsc`)
verifies the case bodies reference existing fixtures/methods (a missing method or wrong arg count is a
compile error with the exact location).

## BodyCall and expressions

- `BodyCall`: `{ fixture, call, args? }`
- `BodyCall.args` are **TS expression strings pasted verbatim** into the generated spec call.

| Intent                                                       | Schema `args[]` entry       | Generated code                                                          |
| ------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------- |
| Env var (secrets / happy-path creds)                         | `"process.env.AUTH_EMAIL!"` | `process.env.AUTH_EMAIL!`                                               |
| Expected test data (invalid creds, error text, shared regex) | `"expected.invalidEmail"`   | `expected.invalidEmail` (requires matching key in top-level `expected`) |
| Rare one-off literal (no `expected` block)                   | `"'/only-used-once'"`       | `'/only-used-once'`                                                     |

**Expected data policy:** Auth features with AC-1 (valid env login) + AC-2 (invalid login) → define
`expected.invalidEmail`, `expected.invalidPassword`, and assertion keys like `expected.authErrorPattern`;
reference them in `BodyCall.args` and `assertions[].arg`. Do **not** use `"'invalid@example.com'"` inline
when `expected` applies.

Common mistakes:

- `'process.env.VAR'` in args — valid TS but wrong semantics (`quoted_env_var_arg`); use bare
  `process.env.VAR!`.
- Credentials in step `fill`/`select` `value` — use `param` + spec `BodyCall.args` instead
  (`secret_in_step_value`).
- Inline `"'bad@example.com'"` for negative tests — use `expected.*` + a top-level `expected` block so
  `support/data/<feature>/expected.json` is generated (`use_expected_for_test_data`).
- When `expected` is defined, inline literals that **duplicate** an `expected` value in
  `BodyCall.args` or `assertions[].arg` are rejected (`inline_test_data_with_expected_block`) — use
  `expected.<key>` instead. Unrelated inline strings (page titles, labels) are still allowed.
- Empty `expected: {}` is rejected (`empty_expected_block`). Duplicate string values across keys are
  rejected (`duplicate_expected_value`).
- Secrets in `expected` — use `.env` + `process.env.*!` only.

- Assertion `arg` is a TS expression string pasted verbatim into the generated `expect(...)` call.
  - **`toHaveURL`** — prefer an **exact path** from ground: `"'/web/index.php/dashboard/index'"`. For
    partial/subdomain-agnostic matches use a **regex literal**: `"/dashboard\\/index/"`. **Never a
    wildcard string** (`"'**/checkout/confirmation/'"`) — confirmed live against a real scaffolded
    project (baseURL configured, the Vindicate default): Playwright prefixes any non-`http(s)` string arg
    with `baseURL` before matching, turning `'**/checkout/'` into the literal
    `'https://example.com/**/checkout/'`, which then **fails to match the real URL** — the `**` no
    longer means "any prefix" once it's stuck after a fixed, already-resolved origin. Rejected as
    `baseurl_unsafe_url_glob` at validate/create time. A regex is never baseURL-resolved and has no
    such gap — use one whenever the match needs to be prefix/suffix-flexible rather than exact.
    Wildcard globs are safe on **`waitForURL` steps only** (`**/dashboard/index`) — confirmed live that
    `page.waitForURL()` does not have this baseURL-prefixing problem, unlike `toHaveURL`; **never** wrap
    a `waitForURL` path with `**` on both sides either (`"**/dashboard/index**"` is invalid and rejected
    as `malformed_url_glob`).
  - Other matchers — prefer quoted string literals where applicable (example: `"'/login'"`). Invalid
    expressions are rejected at codegen time.
- Action values for `fill` / `type` / `select`:
  - `value`: literal string emitted as a quoted Playwright argument.
  - `param`: name of a step param; emitted as the param identifier (example: `"param": "email"` with
    step param `{ "name": "email", "type": "string" }`).
  - **Exactly one** of `value` or `param` is required per fill/type/select action.
- `fill` vs `type`: `fill` sets the DOM value directly (`locator.fill(...)`) — fast, and correct for
  ordinary `<input>`/`<textarea>` fields. `type` (`{ "do": "type", "ref": ..., "value"/"param": ...,
"clear_first"?: true }`) sends real per-character key events (`locator.pressSequentially(...)`) —
  use it when `fill` leaves the field empty or stale after a real `browser_act` `fill` in grounding
  didn't stick. Confirmed live: a React-controlled input whose state updates off `onKeyDown`/`onInput`
  (rather than the native value setter) never observes `fill`'s programmatic value change — the field
  renders empty even though the DOM node technically got a value. `type` is slower; default to `fill`
  and only switch to `type` for fields you've confirmed need it.
- `{ "do": "waitForPageLoad" }` — emits `await this.waitForPageLoad();` (`BasePage` →
  `page.waitForLoadState('domcontentloaded')`). **Use only after `navigate`**, typically in
  `step_navigate`. Not sufficient after submit — see _Submit timing_.
- `waitForURL.pattern` is emitted as a quoted string literal by the generator
  (`page.waitForURL(pattern, { timeout: 15000 })`). Use a path from ground, or a valid glob prefix
  (`**/dashboard/index`). Trailing `**` after a path segment is invalid (`malformed_url_glob`).
- `waitForResponse.urlPattern` is matched by **substring** against the request URL — emitted as `page.waitForResponse(r => r.url().includes('<urlPattern>'))`. Use it after a submit that fires an XHR (see _Submit timing_ below). The pattern must appear in top-level `observed_endpoints` from `ground`.

## Fixture naming

Fixture key is derived from `page_class` camelCase: `LoginPage` → `loginPage`; `CartPage` → `cartPage`.
Multi-page feature ⇒ one fixture per page class.

## Locator descriptor mapping

From capture/memory to a schema element:

- `ref`: stable logical id inside the schema
- `tag`: html tag
- `testid` + `testid_attr`: strongest anchor — rendered as `getByTestId` (project attr) or `//*[@attr]`
- fallback metadata: `role`, `name`, `type`

At least one locator route must be available (`testid+testid_attr`, or `role`, or `name`) or structural
validation fails (`locator_missing`).

**Elements inside an iframe (payment widgets, embedded checkout, third-party forms).** `browser_read`
resolves through `<iframe>` boundaries automatically — same-origin or cross-origin — and any such
element's captured `locator` carries a `frame_path` (the chain of iframe-host locators needed to reach
it). Never hand-author `frame_path` from the legacy `testid`/`role`/`name` fields — codegen renders it
as chained `this.page.frameLocator(...).frameLocator(...).getByRole(...)` automatically, matching
exactly how `browser_act` resolved it live. A `browser_read` line ending in
`[... — in iframe: <hop>]` or `[... — in nested iframe ×N: <hop1> > <hop2> …]` is the signal that this
applies — each `<hop>` names the real identity that hop resolved to (`id=<value>`, `<attr>=<value>`,
or a verified XPath), in outermost-first order.

The most reliable way to get the exact `frame_path` array into the schema is a **finalized recording**
(`ground`'s Phase 2) — its JSON carries the verified `StructuredLocator` objects directly, so nothing is
transcribed by hand. `browser_read`'s text output is not itself machine-readable JSON, so when no
recording exists, reconstruct each hop from its badge identity (`{ "strategy": "dom_id", "value":
"<id>" }` for an `id=` hop, `{ "strategy": "attr_combo", "xpath": "<the shown xpath>" }` for an xpath
hop, etc.) rather than guessing from a visible label — **two distinct iframes can share the same
visible `title`** (common with Stripe/Klarna-style widgets); only the hop identity in the badge
disambiguates them.

**Each hop is one atomic iframe-HOST locator — never a selector that reaches into iframe content.**
`frame_path` hops chain as independent `.frameLocator(hop1).frameLocator(hop2)…` calls; an iframe's
content is a separate document, so a hop's `xpath` can only select the `<iframe>` element itself
(e.g. `//iframe[@title="..."]`), never a descendant inside it (`//iframe[.//button[...]]` is invalid
and will not resolve — codegen has no construct for "reach through this iframe" other than adding
another hop to the array).

**Click-delegate locators (`click_delegate: true`).** A control that can never itself receive a click
— computed `pointer-events: none`, or a collapsed ~1x1px sr-only-input — has its locator derived from
the real clickable ancestor instead, and that locator carries `click_delegate: true`. Pass it through
verbatim, same as `frame_path`: codegen renders the field exactly as normal, but appends `— click-
delegate ancestor: click only, check/uncheck unsupported` to its `// locator-helper:` comment. **Never
substitute the original (non-clickable) element's own `testid`/`id` for this locator** — it looks
plausible but silently fails at act time (occluded/intercepted). This flows through both `browser_read`
(the badge already says `[click only — check/uncheck unsupported]`) and a finalized `mode:'auto'`
recording's `chosen` candidate (`SelectorCandidateSchema.click_delegate`) — a `mode:'human'` recording
never sets this, since a real click event's target is already hit-test-correct.

**Copy the captured `locator` object verbatim — never reconstruct one from memory, and never mix
fields across strategies.** Confirmed live mistake: a `text`-strategy locator authored with `name` (the
`role_name`/`scoped` tiers' field) instead of `value`, plus a `container` (the `scoped` tier's field,
meant to anchor the search to a specific row/dialog) — `text` uses neither. The result compiled and
generated without any visible error, but silently rendered `getByText('', { exact: true })` — an
always-empty, never-matching locator — because codegen read the (unset) `value` field, and `container`
did nothing at all (it's only ever consulted for `scoped`). Both are now caught at validate/create time
(`locator_missing` for the missing `value`; `container_ignored_for_strategy` for the misplaced
`container`), but the fix either way is the same: paste the exact `{ "strategy": "text", "confidence":
"high", "value": "<text>" }` (or whichever strategy/fields) `browser_read`/a recording actually
produced — not a hand-assembled guess at what its shape "should" be. Each strategy's real fields:
`testid`→`attr`+`value`; `dom_id`/`testid_xpath`/`attr_combo`/`sibling_text`/`nth`→`xpath`;
`role_name`→`role`+`name`; `label`/`placeholder`/`text`→`value`; `scoped`→`role`+`name`+`container`.

**Two elements can show the identical exact text with no way to tell them apart by text alone** — e.g.
a cart drawer's line-item price and its Subtotal amount both reading "SEK 700". Confirmed live:
`browser_read`'s scoped plain-text capture (see `ground`) deliberately excludes any text value that
isn't unique within the scope, rather than guessing which occurrence is which — so neither gets its own
ref. Don't try to force one anyway (a positional `nth` guess here is exactly the kind of hand-authored
selector this system exists to prevent). Instead assert on a **container** that legitimately contains
both: `{ "subject": "element", "ref": "cartDialog", "matcher": "toContainText", "arg": "expected.amount" }`
confirms the amount appears somewhere inside the dialog without needing to disambiguate which specific
line it's on — the correct, supported pattern for this shape of assertion, not a workaround.

## Dynamic (runtime-parameterized) locators

For selectors whose value comes from runtime data (e.g. `delete-product-<id>`, a date cell
`data-date="<yyyy-mm-dd>"`, the row you just created), give the element a `dynamic` param list and
put `{param}` placeholders in the locator value (`testid`/`name`/`role` name). Codegen renders it as
a **locator method** (returning `Locator`) instead of a static field.

- `dynamic: [{ name, type }]` — one entry per `{placeholder}`. Every placeholder must match a declared
  param and vice-versa (`dynamic_placeholder_mismatch` otherwise).
- Any action/assertion referencing a dynamic element **must** pass `refArgs: string[]` — TS expression
  strings (one per param, in order), pasted verbatim like `BodyCall.args`. Count must equal the param
  count; passing `refArgs` to a non-dynamic element is an error (`dynamic_ref_args`).
- The runtime value reaches `refArgs` via a **step/verify param** (then supplied from the spec through
  `BodyCall.args` as `process.env.X!`, `expected.key`, or a captured value).

```json
{
  "ref": "deleteBtn",
  "tag": "button",
  "testid": "delete-product-{id}",
  "testid_attr": "data-testid",
  "dynamic": [{ "name": "id", "type": "string" }]
}
```

With a step `{ "name": "step_delete_product", "params": [{ "name": "id", "type": "string" }],
"actions": [{ "do": "click", "ref": "deleteBtn", "refArgs": ["id"] }] }` this emits:

```ts
private deleteProductButton(id: string): Locator {
  return this.page.locator(`//*[@data-testid="delete-product-${id}"]`);
}
async step_delete_product(id: string): Promise<this> {
  await this.deleteProductButton(id).click();
  return this;
}
```

> Capturing the id earlier in the same test (e.g. `const id = await page.get_lastCreatedId()`) is a
> **direct `.ts` edit** in the spec — codegen specs emit only flat `await fixture.call(...)` lines, so
> seed the value via `expected`/`.env` when using `create`, or hand-edit the spec for runtime capture.

## Conditional / ad-hoc actions

`click_if_visible` clicks an element **only if it appears** within a short window — for optional UI that
isn't always present (cookie banners, promos, onboarding coachmarks). It calls the `clickIfVisible`
BasePage/BasePanel helper, so no `if` ever lands in the spec.

- `{ "do": "click_if_visible", "ref": "<ref>", "timeout"?: <ms>, "refArgs"?: [...] }` — `timeout`
  defaults to 2000ms; `refArgs` only when the ref is dynamic.
- Emits `await this.clickIfVisible(this.<field>);` (or `this.<method>(args)` for dynamic refs).

## Page load (after navigate)

After `{ "do": "navigate" }` (emits `page.goto(this.path)`), add `{ "do": "waitForPageLoad" }` so the
step waits for `domcontentloaded` before the next action or verify. Canonical `step_navigate`:

```json
"actions": [
  { "do": "navigate" },
  { "do": "waitForPageLoad" }
]
```

Emits:

```ts
await this.page.goto(this.path);
await this.waitForPageLoad();
```

`waitForPageLoad` does **not** wait for network requests or URL changes. Do **not** use it after a submit
click — use _Submit timing_ waits instead.

## Submit timing (async submits — any flow, not login-specific)

Any submit that triggers async work — login, search, save, add-to-cart, filter apply, etc. — can leave
Playwright in a **pending-navigation** state. If the next `verify_*` runs immediately it may race that
work and flake at the default `actionTimeout` (8000ms). **Choose the wait from what ground observed** —
do not default every login or every form to `waitForResponse`.

Add **one** explicit wait **inside the page-object step**, right after the submit click:

| What ground saw on submit                           | Schema wait                                                     | `observed_endpoints`                                           |
| --------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **XHR/fetch** in `url_trail` or `wait_for_response` | `{ "do": "waitForResponse", "urlPattern": "<path substring>" }` | **Required** — list every distinct submit XHR the step may hit |
| **Redirect only** (URL changes, no submit XHR)      | `{ "do": "waitForURL", "pattern": "<route>" }`                  | Omit — use path from `url_after` / `url_trail`                 |
| **Neither** (sync submit, same page)                | No extra wait                                                   | Omit                                                           |

- `waitForResponse.urlPattern` — substring match on the request URL. Use only when ground captured that
  endpoint. Works for happy **and** negative paths when the same XHR fires (e.g. failed login still
  POSTs). **Not every login needs this** — skip when submit is redirect-only or full page POST with no
  interceptable XHR.
- `waitForURL.pattern` — post-submit route when success navigates away (dashboard, results page). Use
  alone for redirect-only submits, or **in addition to** `waitForResponse` when both XHR and redirect
  matter.

Put the wait in the page-object step, never the spec. **Never** copy endpoint paths from doc examples —
only from ground evidence. Validation rejects `waitForResponse` without matching `observed_endpoints`.

## Worked example: login with XHR submit (expected + env, happy + negative)

**One common pattern** — not the default for all logins or all submits. Use it when ground captured a
submit XHR (here `/web/index.php/auth/validate`). Redirect-only logins would use `waitForURL` on the
dashboard route instead, with no `observed_endpoints`.

Page step uses params; the spec passes env vars for the happy path and `expected.*` for the negative
path. The submit step ends with `waitForResponse` because this app fires an auth XHR on submit.

```json
{
  "feature": "auth",
  "observed_endpoints": ["/web/index.php/auth/validate"],
  "expected": {
    "invalidEmail": "invalid@example.com",
    "invalidPassword": "WrongPass123!",
    "authErrorPattern": "/invalid|incorrect|error/i"
  },
  "pages": [
    {
      "feature": "auth",
      "page_class": "AuthPage",
      "owned_by": "auth",
      "path": "/auth/login",
      "types": [],
      "elements": [
        { "ref": "emailInput", "tag": "input", "name": "email", "type": "email" },
        { "ref": "passwordInput", "tag": "input", "name": "password", "type": "password" },
        { "ref": "loginButton", "tag": "button", "role": "button", "name": "Sign in" },
        { "ref": "authError", "tag": "div", "role": "alert" }
      ],
      "steps": [
        {
          "name": "step_submit_credentials",
          "jsdoc": "Fills credentials and submits the login form.",
          "params": [
            { "name": "email", "type": "string" },
            { "name": "password", "type": "string" }
          ],
          "actions": [
            { "do": "fill", "ref": "emailInput", "param": "email" },
            { "do": "fill", "ref": "passwordInput", "param": "password" },
            { "do": "click", "ref": "loginButton" },
            { "do": "waitForResponse", "urlPattern": "/web/index.php/auth/validate" }
          ]
        }
      ],
      "verifies": [
        {
          "name": "verify_auth_error_visible",
          "jsdoc": "Verifies the auth error alert matches the expected pattern.",
          "params": [],
          "assertions": [
            {
              "subject": "element",
              "ref": "authError",
              "matcher": "toContainText",
              "arg": "expected.authErrorPattern"
            }
          ]
        }
      ]
    }
  ],
  "spec": {
    "suite": "Acme - Auth",
    "generates_storage_state": null,
    "storage_state": null,
    "before_each": null,
    "cases": [
      {
        "ac_id": "AC-1",
        "scenario": "Happy path login",
        "title": "[AC-1] should log in with valid credentials",
        "body": [
          {
            "fixture": "authPage",
            "call": "step_submit_credentials",
            "args": ["process.env.AUTH_EMAIL!", "process.env.AUTH_PASSWORD!"]
          }
        ]
      },
      {
        "ac_id": "AC-2",
        "scenario": "Invalid credentials show error",
        "title": "[AC-2] should show an error for invalid credentials",
        "body": [
          {
            "fixture": "authPage",
            "call": "step_submit_credentials",
            "args": ["expected.invalidEmail", "expected.invalidPassword"]
          },
          {
            "fixture": "authPage",
            "call": "verify_auth_error_visible",
            "args": []
          }
        ]
      }
    ]
  }
}
```

## Progressive build (large / multi-page features)

Build incrementally when the feature is large (3+ pages or 20+ elements):

1. `create` a minimal shell — first page + one smoke case (`validate` with `validateTarget:'create'` first).
2. Per additional page → `register_page` (additive; `npm run audit` after).
3. `add_test_cases` last; `npm run audit` confirms the case bodies compile against the page objects.

## Safety rules

- Do **not** hand-write a brand-new spec/page object that codegen should create — use `create` so the
  barrel + config wiring is correct. (Surgical edits to _existing_ generated files are expected and
  fine — that's the files-as-truth model.)
- `create` once per feature; `register_page` for new pages; `add_test_cases` for new cases; everything
  else is a direct `.ts` edit.

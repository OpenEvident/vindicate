---
node: audit
graph: main
label: Audit
entry_for: []
terminal: true
modes: []
serves: [goal, inputs, steps, tools, rules, output, escalation]
refs: [ref-contract]
---

# Audit

## Goal

Final quality gate. Run the conformance checklist over what was written, **fix hard failures in
place**, report soft warnings, and close the workflow. `npm run audit` (typecheck) is the real
structural gate; the grep checks below catch the convention violations TypeScript can't see.

## Inputs

- The files written/edited this run (specs, page objects, data, barrels).
- The linked stories (for AC coverage).

## Steps

1. **`npm run audit`** (`tsc --noEmit`) — must be clean. Fix type errors first.
2. **Legacy schema store** — if `.vindicate/schemas/` exists, warn that codegen no longer uses it (safe to delete; files are the source of truth now). Do not auto-delete.
3. **Run the hard checks (V3.\*)** — fix each failure in place before closing.
4. **Run the semantic checks** TypeScript can't catch (the convention checks `tsc` is blind to).
5. **Run the soft checks (V4.\*)** — report only, do not block.
6. **Render the summary panel** via `vindicate_show_panel`; emit a one-line verdict + AC coverage in chat.

## Hard checks (V3.* — fix in place)

- **Spec naming** — `tests/<feature>.spec.ts`, kebab-case, matches the suite. Tests live only in `tests/`.
- **Describe wrapper** — every test inside `test.describe('<App> - <Area>')`; no top-level `test(...)`.
- **7-token consistency** — story / `support/data/<x>/` / `<X>Page` / fixture `<x>Page` / `<x>Expected` / `tests/<x>.spec.ts` / describe all use the same noun. `grep -rn "<X>Page\|<x>Expected\|<x>\.spec\.ts" pages panels support tests`.
- **Atomic tests** — one verification objective per test.
- **No bare `expect()` in body** — `grep -nE '^\s+expect\(' tests/*.spec.ts` → empty. All assertions via `verify_*`.
- **No logic in body** — `grep -nE '^\s+(if |throw |try \{|for \(|while \()' tests/*.spec.ts` → empty.
- **No hardcoded URLs** — relative paths / `BASE_URL` only.
- **Locators [C18]** — every `private` field has a preceding `// locator-helper: <strategy>` comment (one of `testid | testid_xpath | dom_id | role_name | label | placeholder | text | attr_combo | scoped | sibling_text | nth | dyn_param`); **no** CSS selectors (`[attr=…]`, `.class`, `#id`) / `.or()` / `.filter()/.first()/.nth()/.last()`. Semantic `getBy*` and XPath are both allowed.
- **AC tags [C20]** — every test title starts with exactly one `[AC-n]` mapped to a story AC; one AC per test; full AC coverage for approved stories.
- **Page object** — extends `BasePage`; `step_*`/`verify_*` `async` + `Promise<this>`; JSDoc on every public method (`@param` + `@returns`); locator block contiguous; one class per file.
- **Traceability** — `// spec: .vindicate/stories/<feature>.story.md` at file top + `// scenario: <name>` before each test.
- **2 imports** — `test` from `@config/page.config` + barrel from `@config/page-loader`; no deep imports; no destructuring barrel data into consts.
- **C17** — no spec without a real `<Feature>Page.ts` (≥1 `step_*` + ≥1 `verify_*`) that audits clean.

## Semantic checks (moved from codegen validator — direct edits aren't otherwise guarded)

Fix every hit in place before closing audit — do not leave hardcoded test data or secrets in generated files.

- **No secret in a step value** — credential-like literal baked into a `fill`/`select` value.
  - Scan: `grep -nE "\.(fill|selectOption)\('[^']*@[^']*'\)" pages/**/*.ts panels/**/*.ts` and credential-named refs.
  - Fix: use a `param` + pass `process.env.X!` from the spec.

- **No hardcoded test data — use `expected.json` [fix in place]** — invalid inputs, fixed error strings, and shared assertion regex belong in `support/data/<feature>/expected.json`, referenced as `expected.<key>`. Never duplicate an `expected.json` value as a literal in page objects or specs.
  - **Page objects** — hardcoded assertion strings/regex in `verify_*`:
    - Scan: `grep -nE "\.(toContainText|toHaveText|toMatch)\(['\"]" pages/**/*.ts panels/**/*.ts`
    - Also: `grep -nE "innerText\(\)\)\.trim\(\)\)\.toContain\(['\"]" pages/**/*.ts panels/**/*.ts`
    - Fix: add/move the value to `support/data/<feature>/expected.json`, import `{ <feature>Expected as expected }` from `@config/page-loader` if missing, change the verify to use `expected.<key>` (or accept a spec param that receives `expected.<key>`).
  - **Specs** — inline invalid creds or error literals instead of `expected.*`:
    - Scan: `grep -nE "step_[a-z_]+\([^)]*['\"][^'\"]+['\"]" tests/*.spec.ts` (flag string args that are not `process.env` or `expected.`)
    - Fix: add keys to `expected.json`, pass `expected.invalidEmail` / `expected.invalidPassword` / etc. in the call args.
  - **Orphan keys** — keys in `expected.json` never referenced:
    - Scan: compare keys in `support/data/<feature>/expected.json` against `expected\.[a-zA-Z0-9_]+` in `tests/`, `pages/`, and `panels/`.
    - Fix: wire the key in the spec or verify, or remove unused keys.
  - **Mismatch** — same string hardcoded in a verify or spec while an identical value exists in `expected.json`:
    - Fix: replace the literal with `expected.<matchingKey>` so one source of truth remains.

- **No quoted env var in spec args** — env-backed credentials must be bare `process.env.X!` in test call args, not wrapped in extra quotes.
  - Scan: `grep -nE "process\.env\.[A-Z0-9_]+" tests/*.spec.ts` should match happy-path creds; reject patterns like `'process.env.AUTH_EMAIL!'` (`quoted_env_var_arg`).
  - Fix: emit bare `process.env.AUTH_EMAIL!` in the spec (schema uses `"process.env.AUTH_EMAIL!"` without outer quotes).

## Soft checks (V4.* — report only)

- Tags applied (e.g. `@hybrid`); hybrid state-graph comment present; single import lines; no blank lines between sequential `step_*`/`verify_*`; no casual `.first()/.nth()/.or()/.filter()` anywhere.

## Anti-pattern scan (regression guards)

Custom logger; method decorators; `globalSetup` pre-auth; `DataLoader`/`CredentialResolver`; `authenticatedPage` fixture; wrapper interfaces over JSON; `@data/*` alias; empty stub files; non-`.ts` source files; probe/`explore-*` scripts; `tests/`/`e2e/`/`specs/` locations.

## Tools

- `vindicate_show_panel` — render the audit summary panel (data-heavy display).

## Output

- **Verdict:** pass / fail / warnings — `tests_written`, `files_touched`, `hard_failures[]`, `soft_warnings[]`.
- **Report (chat):** one line verdict + `✅ AC coverage: N/N covered`. Do not paste the panel or dump the file tree.
- **Secret hygiene (if any credential was shared this session — pasted in chat, typed into a recording, or written to `.env`):** add one line telling the user to treat it as exposed — rotate/invalidate it, and keep the live value only in `.env` (gitignored, never committed). Recordings may retain typed values. Err toward emitting when unsure.

## Escalation

- Unfixable hard failure (needs an external decision) → `verdict: fail`; list the blocker(s) via `vindicate_ask_user`.

---
ref: ref-page-object
pulled_into: [generate, ground]
note: Page-object anatomy, the derived-locator protocol, strategy codes, and the canonical template. `ground` pulls in the locator-protocol half; `generate` pulls in the whole file.
---

# Page object (reference)

## File location and class structure

- Path: `pages/<Feature>Page.ts`
- Class extends `BasePage` from `./BasePage`
- One class per file, one file per web page (1:1 mapping)
- Helper types (e.g. `LoginCredentials`) may co-locate with the class that consumes them
- Generated output adds `// ── Locators/Steps/Verifies ──` section comments and single-line JSDoc blocks.

**Method block order:** locators → `step_*` → `verify_*`. One blank line between groups. No blank lines
within the locator block.

## Locator fields

- `private`, camelCase, suffix matches element kind: `usernameInput`, `loginButton`, `errorMessage`,
  `forgotPasswordLink`
- Contiguous block — no blank lines between locator fields
- Derived from a live browser snapshot or a finalized recording — **never invented**
- Carry a `// locator-helper: <strategy>` comment on the line above
- Must resolve to exactly 1 element (verified via snapshot ref count)
- **Dynamic exception:** a runtime-parameterized locator is a `private` **method** returning `Locator`
  (not a field), e.g. `private dayCell(date: string): Locator { return this.page.locator(\`//td[@data-date="${date}"]\`); }`.
It still carries a `// locator-helper: dyn_param`comment and follows the locator protocol. Call it as`this.dayCell(date).click()`. Use only when the value is genuinely runtime-driven.
- **Live-region exception:** `alert`, `status`, `log` take their accessible name from author markup, not
  content — never bind their visible text as a `getByRole` name (`getByRole('alert', { name: '<msg>' })`
  matches nothing). Locate by role only (`getByRole('alert')`, helper `role_name`) and assert the message
  with a `verify_*` `toContainText`.

**Locators are derived, not authored [CRITICAL].** You do **not** invent, draft, hand-pick, or
transcribe selectors. When you author a codegen schema you provide each element's **captured identity**
(`testid`/`testid_attr`, `role`, `name`, `tag`) from `browser_read`; **codegen derives the locator**
from that identity using the tier ladder below. Your job is to capture the right elements and wire up
steps/verifies — never to write a selector string by hand.

**Selector priority — semantic `getBy*` first, XPath for attributes/id/positional, never CSS.**
The derivation walks this ladder and picks the highest tier that resolves to exactly one element:

1. **testid** (project `testIdAttribute`) → `getByTestId('value')`
2. **testid (other recognised attr)** → `//*[@attr="value"]`
3. **stable id** (non-generated) → `//*[@id="value"]`
4. **role + accessible name** → `getByRole(role, { name, exact: true })`
5. **label / placeholder / text** (role-less controls) → `getByLabel` / `getByPlaceholder` / `getByText`
6. **attribute combination** → `//tag[@name="x"][@type="y"]`
7. **scoped row control** → `getByRole(rowRole, { name }).getByRole(role, { name, exact: true })`
8. **sibling text** (no accessible name from any source — broken/unlabeled markup only) →
   `//tag[preceding-sibling::*[…] or following-sibling::*[…]]`
9. **positional** (last resort, low confidence) → `(…)[n]`

**Strategy codes for `// locator-helper:` comments** (mirror the structured locator's `strategy`):

| Code                             | Rendered as                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `testid`                         | `getByTestId(value)`                                                                                                                       |
| `testid_xpath`                   | `//*[@attr="value"]` (non-project test-id attribute)                                                                                       |
| `dom_id`                         | `//*[@id="value"]`                                                                                                                         |
| `role_name`                      | `getByRole(role, { name, exact: true })`                                                                                                   |
| `label` / `placeholder` / `text` | `getByLabel` / `getByPlaceholder` / `getByText`                                                                                            |
| `attr_combo`                     | `//tag[@a="x"][@b="y"]`                                                                                                                    |
| `scoped`                         | container-scoped `getByRole(...).getByRole(...)`                                                                                           |
| `sibling_text`                   | `//tag[preceding-sibling::*[…] or following-sibling::*[…]]` (no accessible name exists at all — comment includes the matched sibling text) |
| `nth`                            | positional XPath `(…)[n]` (low confidence — surfaced for review)                                                                           |
| `dyn_param`                      | runtime-parameterized locator method (see Dynamic locators)                                                                                |

**Forbidden [CRITICAL]:** CSS selectors of any form (`[attr=…]`, `.class`, `#id`), `.or(...)` chains,
`.filter()`, `.first()`, `.nth()`, `.last()` as uniqueness workarounds. Semantic `getBy*` and XPath are
both allowed; uniqueness comes from the derived locator, never from coercion.

## Methods

- `step_<verb>()`: user action, `async`, returns `Promise<this>`
- `verify_<thing>()`: assertion, `async`, returns `Promise<this>`
- `get_<thing>()`: pure data getter, `async`, returns value (exempt from `Promise<this>`)
- JSDoc required on every public method — one-line imperative summary ≤80 chars, `@param` for each
  parameter, `@returns`

Detection grep:
`awk '/^\s+async (step_|verify_|get_|get[A-Z])/{ if (prev !~ /\*\//) print FILENAME":"NR": missing JSDoc" } { prev = $0 }' pages/*.ts panels/*.ts`

## Optional / ad-hoc elements

For UI that appears only sometimes (cookie banners, promos, onboarding tips), never click
unconditionally — that flakes. `BasePage`/`BasePanel` expose `clickIfVisible(locator, timeout = 2000)`
which waits briefly and clicks only if the element shows (returns `true`/`false`). In codegen use the
`click_if_visible` action; in direct edits call `await this.clickIfVisible(this.cookieClose);`. For an
optional element you only need to _assert presence conditionally_, branch inside a `step_*`/`verify_*`
method (logic is allowed in page objects) — **never** in the spec body.

## Panel rules

- Panels own a reusable DOM region that appears on multiple pages
- Panels do **not** extend `BasePage` — composition only:
  `readonly headerPanel = new HeaderPanel(this.page)`
- In a codegen schema, panels are `is_panel: true`; they must not include `path`.
- `navigate` actions in panel `step_*` definitions are ignored by the generator.
- Panel locators follow the same derived-locator tier rules
- Panel user-interaction methods: `step_*` / `verify_*`
- Panel pure getters: `get<Thing>()` camelCase, no underscore — e.g. `getProfileName()`
- JSDoc required on all panel methods

## Data

- `support/data/<feature>/expected.json` — created when the schema includes a top-level `expected`
  (required for invalid login inputs, error text, shared assertion regex — not for secrets). Reference
  keys as `expected.key` in spec `BodyCall.args` or verify `assertions[].arg`; codegen imports
  `{ <feature>Expected as expected }` in spec and page objects when used.
- Credentials — pass via spec `BodyCall.args` as `process.env.VAR!` (contract C9: `.env` is the secret
  source). Do not bake into step `fill`/`select` `value` fields or into `expected`.
- Top-level keys only in JSON data files — no wrapper objects.
- Imported via barrel when `expected` is set:
  `import { <feature>Expected as expected } from '@config/page-loader'`

## Template (canonical — mirror this shape)

```ts
import { Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export type LoginCredentials = { username: string; password: string };

export class LoginPage extends BasePage {
  readonly path = "/auth/login";

  // locator-helper: testid
  private usernameInput = this.page.getByTestId("username");
  // locator-helper: testid
  private passwordInput = this.page.getByTestId("password");
  // locator-helper: role_name
  private loginButton = this.page.getByRole("button", { name: "Sign in", exact: true });
  // locator-helper: role_name
  private errorMessage = this.page.getByRole("alert");

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the login page and waits for it to load.
   * @returns this for chaining
   */
  async step_navigate(): Promise<this> {
    await this.page.goto(this.path);
    await this.waitForPageLoad();
    return this;
  }

  /**
   * Fills credentials and submits the login form.
   * @param credentials - Username and password pair
   * @returns this for chaining
   */
  async step_login(credentials: LoginCredentials): Promise<this> {
    await this.usernameInput.fill(credentials.username);
    await this.passwordInput.fill(credentials.password);
    await this.loginButton.click();
    // Only when ground observed a submit XHR — redirect-only logins use waitForURL instead (see ref-codegen-schema Submit timing).
    await this.page.waitForResponse((r) => r.url().includes("/web/index.php/auth/validate"));
    return this;
  }

  /**
   * Verifies the error alert contains the expected text.
   * @param expectedText - Substring expected in the error message
   * @returns this for chaining
   */
  async verify_errorMessage(expectedText: string): Promise<this> {
    await this.errorMessage.waitFor({ state: "visible" });
    expect((await this.errorMessage.innerText()).trim()).toContain(expectedText);
    return this;
  }
}
```

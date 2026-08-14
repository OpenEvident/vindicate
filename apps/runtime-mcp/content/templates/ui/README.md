# {{projectName}}

End-to-end tests built with [Playwright](https://playwright.dev/) and TypeScript, generated and maintained by [Vindicate](https://vindicate.io).

---

## Prerequisites

- Node.js 20+
- npm 10+

---

## Setup

1. **Install dependencies**
   ```bash
   npm install
   npx playwright install chromium --with-deps
   ```

2. **Configure the target URL**

   Scaffold creates `.env` with your `BASE_URL` and `.env.example` as a committed sample.
   Edit `.env` to change the URL or add credential variables your tests need.

---

## Running tests

| Command | What it does |
|---|---|
| `npm test` | Run all tests headlessly |
| `npm run test:headed` | Run all tests with a visible browser |
| `npm run ui:headless` | Alias for headless run (used in CI) |
| `npm run audit` | TypeScript typecheck — run this before committing |

Test results land in `test-results/`:
- `test-results/html-report/` — Playwright HTML report
- `test-results/results.json` — JSON report (pipeline import)
- `test-results/results.xml` — JUnit XML (CI reporter)

---

## Folder structure

```
.
├── tests/                           # Test specs (one file per feature)
│   ├── smoke.spec.ts                # Bootstrap reachability check
│   └── <feature>.spec.ts
│
├── pages/                           # Page objects — flat, one class per web page
│   ├── BasePage.ts                  # Shared Playwright utilities (extended by all pages)
│   └── <Feature>Page.ts
│
├── panels/                          # Reusable DOM regions (header, nav, modal, etc.)
│   ├── BasePanel.ts
│   └── <Feature>Panel.ts
│
├── support/
│   ├── config/
│   │   ├── page-loader.ts           # Barrel — all page objects, panels, and test data
│   │   └── page.config.ts           # Playwright fixtures (extends base test)
│   └── data/
│       └── <feature>/
│           └── expected.json        # Asserted UI strings for that feature
│
├── .vindicate/                         # Vindicate project config and agent memory
│   ├── stories/
│   │   └── <feature>.story.md       # Feature intent, acceptance criteria, scenarios
│   ├── recordings/
│   │   └── <flow>.json              # Finalized recordings — ordered steps + element identity
│   ├── recordings-index.json        # Compact index of finalized recordings
│   └── config.json                  # Project test-id attribute name
│
├── test-results/                    # Generated output (not committed)
├── playwright.config.ts
├── tsconfig.json
├── package.json
├── .env.example                     # Committed sample (placeholders)
└── .env                             # Local only — never committed
```

---

## Adding a new feature

Each feature follows a consistent 7-token naming convention derived from a single lowercase noun (e.g. `login`):

| Token | Example |
|---|---|
| Story file | `.vindicate/stories/login.story.md` |
| Data folder | `support/data/login/` |
| Page class | `LoginPage` in `pages/LoginPage.ts` |
| Fixture key | `loginPage` |
| Barrel export | `loginExpected` |
| Spec file | `tests/login.spec.ts` |
| Describe title | `'MyApp - Login'` |

To add tests for a new feature, use the **grow_tests** workflow in Vindicate. It handles story discovery, page object authoring, fixture wiring, and spec generation in one guided pass.

---

## Key conventions

- **Locators prefer semantic `getBy*`.** `page.getByTestId('username')` / `page.getByRole('button', { name: 'Sign in', exact: true })` are the default; XPath (`page.locator('//...')`) covers attribute/id/positional cases. CSS selectors are not used.
- **No `expect()` in spec bodies.** All assertions live in `verify_*` methods on page objects.
- **No hardcoded URLs in specs.** `BASE_URL` comes from `.env` via `playwright.config.ts`.
- **Test titles start with an AC tag.** `[AC-1] should display error on invalid login`
- **Typecheck before committing.** `npm run audit`

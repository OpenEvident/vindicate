# {{projectName}}

API tests built with [Playwright](https://playwright.dev/) and TypeScript, generated and maintained by [Vindicate](https://github.com/OpenEvident/vindicate).

---

## Prerequisites

- Node.js 20+
- npm 10+

---

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
   (No browser install needed — API tests don't launch a browser.)

2. **Configure the target URL**

   Scaffold creates `.env` with your `BASE_URL` and `.env.example` as a committed sample.
   Edit `.env` to change the URL, point `API_BASE_URL` at a different host than the one under
   test (if your API lives elsewhere), or add credential variables your tests need.

---

## Running tests

| Command | What it does |
|---|---|
| `npm test` | Run all tests |
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
│   ├── api-smoke.spec.ts            # Bootstrap reachability check
│   └── <feature>.spec.ts
│
├── clients/                         # Resource clients — flat, one class per resource
│   ├── BaseApiClient.ts             # Shared request-context handling (extended by all clients)
│   └── <Resource>Client.ts
│
├── builders/                        # Payload builders — one per resource with a write body
│   └── <Resource>PayloadBuilder.ts
│
├── support/
│   ├── config/
│   │   ├── client-loader.ts         # Barrel — all resource clients
│   │   └── api.config.ts            # Playwright fixtures (extends base test)
│   └── data/
│       └── <feature>/
│           └── expected.json        # Fixed/negative-path test data for that feature
│
├── .vindicate/                         # Vindicate project config and agent memory
│   ├── stories/
│   │   └── <feature>.story.md       # Feature intent, acceptance criteria, scenarios
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

Each feature follows a consistent naming convention derived from a single lowercase noun (e.g. `posts`):

| Token | Example |
|---|---|
| Story file | `.vindicate/stories/posts.story.md` |
| Data folder | `support/data/posts/` |
| Client class | `PostsClient` in `clients/PostsClient.ts` |
| Fixture key | `postsApi` |
| Barrel export | `postsExpected` |
| Spec file | `tests/posts.spec.ts` |

To add tests for a new feature, use the **grow_tests** workflow in Vindicate. It handles story
discovery, client authoring, fixture wiring, and spec generation in one guided pass.

---

## Key conventions

- **One client per resource, always.** Never combine two resources into one file, even a small one.
- **Auth: log in once, not per test.** See `api.config.ts`'s worker-scoped fixture pattern for any
  endpoint that needs a token — the API equivalent of a UI suite's saved storage state.
- **Fixed/negative-path values live in `expected.json`**, not inline in the test — see
  `support/data/<feature>/expected.json`.
- **No hardcoded URLs in specs.** `BASE_URL` (and `API_BASE_URL`, if set) come from `.env` via
  `playwright.config.ts` / `api.config.ts`.
- **Test titles start with an AC tag.** `[AC-1] should return 404 for a missing resource`
- **Typecheck before committing.** `npm run audit`

---
ref: ref-api-codegen-schema
pulled_into: [generate]
note: Canonical input shape + examples for the API-layer vindicate_generate_code operations. Appended to the `generate` node only for API codegen ops (create_api / add_api_test_cases / register_client), mirroring how ref-codegen-schema is appended only for the UI ops.
---

# API codegen schema (reference)

Canonical shape for the API-layer `vindicate_generate_code` operations. **The files are the source of
truth:** `create_api` generates a conformant scaffold once; after that the `.ts` files are
authoritative. The schema is only an **input contract** for the ops below — nothing is persisted or
read back.

Shares primitives with [`ref-codegen-schema`](./ref-codegen-schema.md)'s UI schema (`Param`,
`TypeDef`, `expected`) but diverges where the generated code itself diverges: a client **method**
is one HTTP call (not a multi-action `step_*`), and assertions are **inline in the spec body**
(`expect(response.status()).toBe(201)`), never routed through a `verify_*`-style indirection —
matching the fixed `vindicate-api` reference template's own convention: "what's being checked is
visible without a detour through a helper."

## Top-level

- `mode: "validate_api" | "create_api" | "add_api_test_cases" | "register_client"`
- `validateTarget`: required when `mode:'validate_api'` — **only `"create_api"`** is supported.
  `add_api_test_cases` and `register_client` have no dry-run (there is no schema to cross-check);
  their gate is `npm run audit` (`tsc`) after the write.
- `feature: string` — the feature slug (lowercase noun; drives naming, same convention as UI).
- `overwrite?: boolean` — only honored by `create_api` (see the guard below).

**Workflow:** for a new API feature, `validate_api` (target `create_api`) → fix every `errors[]`
entry → `create_api`. `validate_api` writes no files. **`create_api` refuses if the feature already
exists** (its spec or any of its clients are present) unless you pass `overwrite: true`. Add a
resource → `register_client`; add tests → `add_api_test_cases`; anything else → direct `.ts` edit.

| Op                   | Input                                                         | Effect                                                                                                                                                                           | Re-runnable?                                              |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `create_api`         | inline `schema` (clients + spec + optional builders/expected) | Generates the whole feature fresh: resource client(s), `client-loader.ts` exports, `api.config.ts` fixtures, spec, `expected.json`, auth-setup fixture (if `auth_setup` present) | **No** — once per feature; re-running clobbers hand edits |
| `add_api_test_cases` | `cases[]`                                                     | Appends new `test()` blocks before the describe close (does not regenerate)                                                                                                      | Yes                                                       |
| `register_client`    | one `client` def                                              | Generates that one resource client + wires **only** its `client-loader.ts` / `api.config.ts` lines (anchor-insertion); never rewrites existing files                             | Yes (additive)                                            |
| `validate_api`       | `validateTarget:'create_api'` + the `create_api` schema       | Dry-run for `create_api` only; returns `errors[]`, writes nothing                                                                                                                | Yes                                                       |

> Everything else (change a method/assertion, delete a test, refactor) is a **direct `.ts` edit** —
> not a codegen op. `npm run audit` (`tsc --noEmit`) + the `audit` node are the backstop.

## `create_api` schema

- `clients[]`:
  - `feature`, `client_class`, `owned_by` (the feature slug that owns this client — must equal the
    `create_api` `feature` for every client in this schema; a client belonging to a _different_
    feature is `owned_by_mismatch` — see _Cross-cutting clients_ below)
  - `fixtures[]`: the fixture key(s) `ApiCall.fixture` resolves against — **explicit, not derived**.
    Usually one entry following the `<Resource>Api` convention (`PostClient` → `["postApi"]`,
    `UsersClient` → `["usersApi"]`). `create_api` wires **every** declared fixture on **every**
    client the same way — `async ({ apiRequest }, use) => use(new <ClientClass>(apiRequest))` —
    regardless of how many fixtures a client lists; there's no field saying which fixture should
    bind to a _different_ context, so codegen never guesses one. A client legitimately needing a
    second instance on a different context (the reference template's `AuthClient` — one instance on
    the raw context, one on _Auth setup_'s token-attached `authenticatedRequest`) declares both
    fixture names in `fixtures[]` so validation and `ApiCall.fixture` resolution both know about
    them, then a **direct edit** to `api.config.ts` repoints the specific fixture's implementation
    at `authenticatedRequest` — one line, same "files are truth after generation" model as
    everything else in this schema.
  - `types[]`: `{ name, fields[] }` — request/response shapes this client's methods use. A field is
    optional the same way UI's `TypeDef` fields are: suffix the **name** with `?` (`{ "name": "id?",
"type": "number" }` renders `id?: number`) — don't mark every field required just because the
    grounded response always includes it; grounded from a real OpenAPI doc, mark a field optional
    unless it's in that operation's own `required[]` (Swagger's Pet, for example, only requires
    `name`/`photoUrls` — `id`/`category`/`tags`/`status` are not required on create).
  - `methods[]`: `{ name, http_method, path, path_params?, body_param?, body_type?, jsdoc? }`
    - `http_method`: `get | post | put | patch | delete | head`
    - `path` — **relative, never a leading `/`** (`posts/{postId}`, not `/posts/{postId}`) —
      enforced (`leading_slash_path`). Playwright's `APIRequestContext` joins a relative path onto
      `baseURL` (keeping any base path segment, e.g. `/v2`), but treats a leading-slash path as
      **absolute** and drops that segment entirely. A raw OpenAPI `paths` key is always leading-slash
      by spec — strip it when grounding `path`. May carry `{param}` placeholders (e.g.
      `posts/{postId}`) — every placeholder must have a matching entry in `path_params` and vice versa.
    - `body_param` + `body_type` are **required together** — a method either takes a body (both
      present) or doesn't (both absent). `body_type`: `json | form | multipart`
- `builders[]?`: `{ builder_class, target_type, owning_client?, fields: [{ name, type, default }] }`
  — one builder per resource that needs a write body. `default` is a TS expression string pasted
  verbatim (same convention as `BodyCall.args` in the UI schema) — **for a `type: "string"` field,
  `default` must be a quoted literal** (`"'Playwright API test'"`, not `"Playwright API test"` —
  the latter parses as a reference to an undeclared identifier, not a string) — enforced
  (`unquoted_string_builder_default`). Only generate a builder when a resource actually has a
  create/update body — a read-only client (like `UsersClient`) needs none.
  `owning_client`: the `client_class` whose `types[]` declares `target_type` — set it whenever
  `target_type` names an interface (the common case: a builder for `PostClient`'s `Post`), so the
  generated builder can import it (client types render inline in the client's own file, per
  _Client method mapping_ below — there's nowhere else to import from). Omit only when
  `target_type` is a primitive or an inline object literal type, which needs no import.
- `expected?`: object — **required** when any case uses fixed/negative-path values (a known-invalid
  id, an exact error message). Codegen writes `support/data/<feature>/expected.json` and imports
  `<featureCamel>Expected` in the spec. **Never** put secrets or env-backed credentials here.
- `spec`:
  - `suite` — describe title, `'<App> - <Area>'` convention, same as UI (worked example below:
    `"Acme - Posts"`) — not enforced, but the only convention this schema demonstrates.
  - `auth_setup: AuthSetup | null` — see _Auth setup_ below
  - `cases[]`: `{ ac_id, scenario, title, annotation?, calls: ApiCall[] }` — `title` **must** start
    with `[<ac_id>]` (`missing_ac_prefix`), e.g. `ac_id: "AC-1"` requires `title` to start with
    `"[AC-1]"`.

## `register_client` schema

`{ feature, client: <one client def as in clients[] above> }`. Generates
`clients/<Resource>Client.ts` and inserts **only** that client's `export … from` line in
`client-loader.ts` and its fixture (import + type + impl) in `api.config.ts`. Existing files are
untouched. Use this — never `create_api`, never hand-wiring — to add a resource to an existing feature.

## `add_api_test_cases` schema

`{ feature, cases: ApiTestCase[] }`. Each case: `{ ac_id, scenario, title, annotation?, calls }`.
Codegen appends the `test()` block(s) before the describe close. No dry-run — after writing,
`npm run audit` (`tsc`) verifies the case bodies reference existing fixtures/methods.

## `ApiCall` — one client-method call plus its inline assertions

```json
{
  "fixture": "postApi",
  "method": "getById",
  "args": ["postId"],
  "assertions": [
    { "subject": "status", "matcher": "toBe", "arg": "200" },
    { "subject": "body_json", "matcher": "toMatchObject", "arg": "{ id: postId }" }
  ]
}
```

- `args[]` are TS expression strings pasted verbatim into the generated method call — same
  convention as `BodyCall.args` in the UI schema (`process.env.X!`, `expected.key`, a literal).
- `assertions[].subject`: `status | status_text | body | body_json | header` — what part of the
  response to check. `header` requires `header_name`.
- `assertions[].matcher`: `toBe | toEqual | toMatchObject | toContain | toContainEqual |
toBeGreaterThan | toBeLessThan | toBeDefined | toBeUndefined | toBeNull`.
- `assertions[].arg` — a TS expression string, same pasted-verbatim convention as everywhere else in
  this schema. **Required** for every matcher except `toBeDefined`/`toBeUndefined`/`toBeNull`, which
  must **omit** it.
- Each `ApiCall` renders as one `const response = await <fixture>.<method>(<args>);` followed by one
  `expect(...)` line per assertion — exactly the shape `tests/post.spec.ts` already uses by hand.
  Multiple calls in one case are numbered positionally: `response`, `response2`, `response3`, …
  There is no other name a later call can rely on — see `capture` below for the only way to carry a
  value from one call into a later one.

### `capture` — using one call's response in a later call (e.g. create then fetch by id)

```json
{
  "fixture": "petApi",
  "method": "addPet",
  "args": ["new PetPayloadBuilder().build()"],
  "capture": { "as": "createdPet", "field": "id" },
  "assertions": [{ "subject": "status", "matcher": "toBe", "arg": "200" }]
}
```

- `capture?: { as: string, field?: string }` — optional on any `ApiCall`. Renders
  `const <as> = (await <responseVar>.json()).<field>;` (or, with `field` omitted, the whole parsed
  body: `const <as> = await <responseVar>.json();`) right after the call's own response line, so a
  **later** call in the same case can reference `<as>` in its own `args`/`assertions[].arg` as a
  real, declared variable — e.g. a second call's `"args": ["createdPet.id"]`.
- `field` is a dot-path into the **already-parsed JSON body** — the actual property name on the
  response object (`"id"`, `"data.token"`), never one of `ApiAssertion`'s `subject` names
  (`status`/`status_text`/`body`/`body_json`/`header`). **`field: "body_json"` is a common mistake**
  — `response.json()` already _is_ the parsed body; there is no `.body_json` property on it, so
  this renders `(await response.json()).body_json`, which is `undefined` at best. Enforced for the
  two subject names no real API would plausibly return as a literal field
  (`ambiguous_capture_field`) — **omit `field` entirely** to capture the whole body, don't reach for
  a subject name:
  ```json
  // WRONG — body_json is not a field on the parsed body:
  "capture": { "as": "createdPet", "field": "body_json" }
  // RIGHT — omit field for the whole body, or name the real property:
  "capture": { "as": "createdPet" }
  "capture": { "as": "createdPetId", "field": "id" }
  ```
- `as` must be a valid identifier and must not collide with another `capture.as` or with this case's
  own `response`/`response2`/… names (`invalid_capture_name` / `duplicate_capture_name`).
- This is the **only** way to chain call data — inventing a variable name (`createdPet.id`) without
  a matching `capture` on the call that creates it renders a reference to something never declared:
  valid syntax, guaranteed `tsc` failure. If you only need the id for a **later, separate** test
  case rather than the same one, fetch it via a **fixture** instead (see the real template's own
  `postId` fixture in `api.config.ts`), not a schema-level capture.

## Fixture naming

`ApiCall.fixture` resolves against the `fixtures[]` declared on each `clients[]` entry (see above)
— an explicit field, not a mechanical derivation, because the mapping isn't always 1:1 (`AuthClient`
needs two). Default convention for the common one-fixture case: `<Resource>Api`, lowercased
(`PostClient` → `postApi`, `UsersClient` → `usersApi`). A fixture name must be unique across every
client in one schema (`duplicate_client_fixture`).

## Cross-cutting clients (e.g. a shared auth client)

`owned_by_mismatch` requires every client in one `create_api` schema to be `owned_by` the same
feature being created — one `create_api` call is scoped to one feature, same invariant as the UI
schema's `create`. A resource whose _own_ endpoints need a bearer token (the common case: the
feature's backend requires auth) declares that as `spec.auth_setup` on the _same_ schema — no
separate client needed just to attach a header. Only declare a full `AuthClient`-style client
(login/me methods, its own test coverage) when the auth API itself needs testing as a resource in
its own right — do that via its **own** `create_api` call (`feature: "auth"`), then reference its
`authClient`/`authenticatedClient` fixtures from other features' spec `calls[]` without redeclaring
the client (mirrors how UI features reuse an already-registered page's fixture instead of
redeclaring the page). Redeclaring someone else's client inside your feature's `clients[]` is exactly
what `owned_by_mismatch` catches.

## Client method mapping

From grounded evidence (`ground`'s `api-ingest` per-endpoint record) to a schema method:

- `name`: the client method name (`create`, `getById`, …) — chosen to read like the resource's verb,
  not the raw HTTP method
- `http_method` + `path`: straight from the grounded endpoint
- `path_params`: one entry per `{param}` placeholder in `path`
- `body_param` + `body_type`: from the grounded request body shape, or omitted entirely for a
  bodyless method (GET/DELETE/HEAD, almost always)

At least a `path` and `http_method` are required for every method — there is no optional-locator
equivalent here; an endpoint without a real, grounded path is not a method Vindicate will generate.

## Auth setup — the token-once pattern

```json
{
  "login_http_method": "post",
  "login_path": "auth/login",
  "credential_params": [
    { "name": "username", "type": "string" },
    { "name": "password", "type": "string" }
  ],
  "token_field": "accessToken",
  "header_name": "Authorization",
  "header_value_template": "Bearer {token}"
}
```

When `spec.auth_setup` is present, `create_api` wires three **worker-scoped** fixtures in
`api.config.ts` (login happens **once per worker**, not once per test — the API equivalent of UI's
saved storage state, and the reason a raw `create_api` schema needs this block rather than treating
auth as just another client method): an unauthenticated request context (same `API_BASE_URL` /
`BASE_URL` resolution as the primary `apiRequest` fixture — `auth_setup` doesn't carry a separate
host), a `authToken` fixture that calls `login_path` once and reads `token_field` out of the JSON
response, and an authenticated request context carrying `header_name: header_value_template` (with
`{token}` substituted) as a default header. `header_name`/`header_value_template` default to
`Authorization`/`Bearer {token}` when omitted. Omit `auth_setup` (`null`) entirely for an API with
no auth.

Each `credential_params` entry is read from `.env` as `process.env.<FEATURE>_<PARAM>!` — feature and
param name upper-snake-cased and joined (feature `"posts"`, param `"username"` →
`process.env.POSTS_USERNAME!`), the same `process.env.X!`-only convention as everywhere else in this
schema, prefixed by feature so two features' auth_setups never collide on a generic name like
`USERNAME`. Tell the user to set `POSTS_USERNAME`/`POSTS_PASSWORD` in `.env` and wire the
corresponding CI secret (same as the Data rule in `generate.md`).

## Progressive build (large / multi-client features)

Build incrementally when the feature is large (3+ resources or many methods):

1. `create_api` a minimal shell — first client + one smoke case (`validate_api` with
   `validateTarget:'create_api'` first).
2. Per additional resource → `register_client` (additive; `npm run audit` after).
3. `add_api_test_cases` last; `npm run audit` confirms the case bodies compile against the clients.

## Worked example: Post resource with builder, no auth (matches the fixed `vindicate-api` template)

Posts (jsonplaceholder) needs no auth, hence `auth_setup: null` — see _Auth setup_ above for the
shape a feature whose own endpoints require a bearer token would use instead.

```json
{
  "clients": [
    {
      "feature": "posts",
      "client_class": "PostClient",
      "owned_by": "posts",
      "fixtures": ["postApi"],
      "types": [
        {
          "name": "Post",
          "fields": [
            { "name": "id", "type": "number" },
            { "name": "userId", "type": "number" },
            { "name": "title", "type": "string" },
            { "name": "body", "type": "string" }
          ]
        }
      ],
      "methods": [
        {
          "name": "create",
          "http_method": "post",
          "path": "posts",
          "body_param": { "name": "post", "type": "Post" },
          "body_type": "json"
        },
        {
          "name": "getById",
          "http_method": "get",
          "path": "posts/{postId}",
          "path_params": [{ "name": "postId", "type": "number" }]
        },
        {
          "name": "delete",
          "http_method": "delete",
          "path": "posts/{postId}",
          "path_params": [{ "name": "postId", "type": "number" }]
        }
      ]
    }
  ],
  "builders": [
    {
      "builder_class": "PostPayloadBuilder",
      "target_type": "Post",
      "owning_client": "PostClient",
      "fields": [
        { "name": "title", "type": "string", "default": "'Playwright API test'" },
        {
          "name": "body",
          "type": "string",
          "default": "'Automated with Playwright request context'"
        },
        { "name": "userId", "type": "number", "default": "1" }
      ]
    }
  ],
  "expected": { "nonExistentPostId": 999999999 },
  "spec": {
    "suite": "Acme - Posts",
    "auth_setup": null,
    "cases": [
      {
        "ac_id": "AC-1",
        "scenario": "Create Post",
        "title": "[AC-1] should create a new post",
        "calls": [
          {
            "fixture": "postApi",
            "method": "create",
            "args": ["{ title: 'hello', body: 'world', userId: 1 }"],
            "assertions": [
              { "subject": "status", "matcher": "toBe", "arg": "201" },
              {
                "subject": "body_json",
                "matcher": "toMatchObject",
                "arg": "{ title: 'hello', body: 'world', userId: 1 }"
              }
            ]
          }
        ]
      },
      {
        "ac_id": "AC-6",
        "scenario": "Not Found",
        "title": "[AC-6] should return 404 for a post that does not exist",
        "calls": [
          {
            "fixture": "postApi",
            "method": "getById",
            "args": ["expected.nonExistentPostId"],
            "assertions": [{ "subject": "status", "matcher": "toBe", "arg": "404" }]
          }
        ]
      }
    ]
  }
}
```

## Safety rules

- Do **not** hand-write a brand-new client/spec that codegen should create — use `create_api` so the
  barrel + config wiring is correct. (Surgical edits to _existing_ generated files are expected and
  fine — that's the files-as-truth model.)
- `create_api` once per feature; `register_client` for new resources; `add_api_test_cases` for new
  cases; everything else is a direct `.ts` edit.
- Secrets/credentials for `credential_params` come **only** from `.env` via `process.env.X!` in the
  generated spec — never inline, never in `expected`.

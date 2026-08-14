---
node: ground
graph: main
label: Ground
entry_for: [gaps]
modes: [ai-explore, human-record, source-scan, recording-ingest, api-ingest]
serves: [goal, inputs, steps, tools, rules, output, transitions, escalation, mode-slice]
refs: [ref-page-object, ref-memory]
---

# Ground

> **Appended references:** [`ref-page-object`](../refs/ref-page-object.md) (the full derived-locator
> protocol + strategy codes) and [`ref-memory`](../refs/ref-memory.md) (the `.vindicate/` layout + the
> locator-reuse sequence). The locator rules below are the working summary; the protocol detail is in the refs.

## Goal
Get **validated, real** evidence for what the story (or failure) needs — for a `ui`/`hybrid` feature,
locators captured from the live DOM **or a recording**; for an `api` feature, the endpoint shape
(method/path/auth/request/response) from a real source (OpenAPI, Postman, curl, or a live probe) —
and **never invented** either way. This is the grounding that prevents hallucinated selectors *and*
hallucinated API contracts. The evidence is **carried forward in-context** (handed to `generate`)
plus, for a new UI flow, a **reusable recording artifact**. No `.ts` files (page objects, resource
clients) are written here — that happens in `generate`.

## Inputs
- The **drafted** story (write — not yet approved; approval is in `design`) or the **approved** story (fix/refactor) / the failing element (fix) / the area to map (gaps).
- Starting URL — `target_url` from the request, else `BASE_URL` from `.env`.
- Existing recordings — **`browser_record_list`** (each row shows pre/post-conditions, depends_on, pages, step count).
- `.vindicate/config.json` (`testIdAttribute`).

## Steps
1. **Check existing recordings FIRST — `browser_record_list`.** This is how prerequisites and prior captures are reused. If the flow (or a prerequisite like auth) is already recorded, **reuse it via `depends_on`** and its `pre_conditions` — do **not** re-capture those locators/steps. Example: automating "create project" when login is already recorded → the new flow declares `depends_on: ["login"]`, `pre_conditions: ["user is authenticated"]`; auth is not re-explored.
2. **Locator reuse for individual elements** (stop at first hit): L1 — an existing recording (step 1) that already carries the element's identity → reuse it. L2 — grep `pages/*.ts` / `panels/*.ts` for a matching `private` field → reuse, mirror its `// locator-helper:` strategy. L3 — live capture (the mode work below).
3. **Pick the approach — usually without asking** (see Decision rules). Default is **AI explore**. Announce the plan in one line (approach + scenario + URL) and proceed.
4. **Capture / verify** per approach. Each element's locator is derived + uniqueness-verified at capture (the Locator rules — semantic `getBy*` first, no CSS, strategy marker); low-confidence results are surfaced.
5. **Carry the captured element identities forward** for `design`/`generate` (and, for a new flow, finalize them into a recording in Phase 2). Do **not** edit generated page-object files here.

## Decision rules — pick the mode (at entry)
- **Feature `layer == api` → `api-ingest`.** No browser involved at all (see the mode slice). For `layer == hybrid`, ground the UI portion normally (below) and the API portion via `api-ingest`'s own steps — they're independent evidence-gathering passes feeding the same `generate` step later.
- **User provided a recording to automate → `recording-ingest`.** The recording already carries the flow + per-element identity; ingest it, do not re-explore live (see the mode slice).
- **App-under-test source in the repo (`app_source_found`) → `source-scan`** first; fall through to `ai-explore` for anything unresolved.
- **Otherwise → `ai-explore` (default).** The agent navigates and captures selectors itself, then records a clean pass (Phase 2) for a new story flow.
- **Can the AI actually drive this flow?** If a new flow is gated by something the agent can't pass (auth wall, captcha) or needs intricate human judgment, choose **`human-record`** — the human explores *and* records in one session (it replaces both ai-explore phases). Use `vindicate_ask_user`, **lead with AI explore as the recommendation**, explain when each is better; never force human recording as the only option.
- **Do NOT deliberate** for fixing/healing, small/simple tasks, or flows already recorded — just proceed (AI explore, reusing existing recordings for context).
- **Explore width — tight + opportunistic.** Scope capture to the draft's candidate scenarios and the flow they traverse; opportunistically grab on-path elements you pass through anyway. Don't map the whole feature — scenarios added later in `design` that lack evidence return here via `design → ground`.

## Tools
- `browser_session`, `browser_navigate`, `browser_read`, `browser_act` — live capture/drive (default **headed**; `headless:true` only if asked). `browser_fill_form` fills several known fields in one call instead of one `browser_act` per field — see below for when it applies.
- `browser_diagnose` — **fallback only** after `browser_read` when you still cannot locate/act; one viewport screenshot to see *why* (modal, disabled control, missing prior step). Do not use element scope for a missing/blocked target — scoped shots wait for visibility. Diagnosis only — never to author selectors.
- `api_request` — **fallback/gap-filler only**, `api-ingest` mode. Sends one real HTTP request. Never called proactively to double-check a source the user already gave completely — only to fill a genuine information gap (an endpoint's response shape wasn't specified) or, later, to diagnose a real `execute`/`heal` failure.
- `browser_record_list` — check existing recordings (always, step 1).
- `browser_record_start` (`mode:'auto'` for agent-recorded new flows, `mode:'human'` for human handoff), `browser_record_finalize`, `browser_record_discard`, `browser_record_get`, `browser_record_read`, `browser_record_annotate`.
- `vindicate_ask_user` — credentials; the rare AI-vs-Human choice; locator escalation options; a missing API detail with no other source.

## Rules
- **One browser tool per session.** Call `browser_*` tools on a given `session_id` **one at a time** — wait for each result before the next. Parallel calls return **session busy**; this is critical during recording replay (Phase 2).
- **Ask for user-supplied data at the point of need.** Don't front-load credential/data prompts. When exploration reaches a field needing a value the agent can't derive (login, OTP, account-specific data), ask *then* via `vindicate_ask_user`, use it transiently to drive, and **never echo it back into chat**. Real runs read secrets from `.env`; anything shared in chat is flagged for rotation at close-out (see `audit`/`escalate`).
- **Locators are derived, never authored.** `browser_read` derives a uniqueness-verified locator for each element (used for live acting); when authoring a codegen schema you provide each element's captured **identity** (`testid`/`role`/`name`/`tag`) and codegen derives the locator from it. You do **not** invent, draft, hand-pick, or transcribe selectors — capture the right elements; hand-written selectors are the #1 hallucination source and are forbidden.
- **Big pages — narrow the read, don't guess from a partial list.** If `browser_read` returns `⚠️ showing N of M elements`, try `viewport_only:true` first — confirmed the one that actually recovers a truncated target on an iframe-heavy page (checkout/payment widgets routinely get cut, since iframe content is appended after the top page and truncation just cuts the tail). `scope:{css}` only resolves against the top-level document — it returns nothing for content inside an iframe. `scope:{ref}` only works when the ref is already in a snapshot you have — it can't recover one that a truncated read never showed you in the first place.
- **Plain, non-interactive text (an amount, a summary label, an item name — no role, no id, no `data-testid`) is only captured inside an explicit scope, never on a full-page read.** Confirmed live: a "Your Cart" drawer's Subtotal/Total/line-price rows are invisible to `browser_read` no matter how many times you re-read it unscoped — they're bare `<span>`/`<div>` text, structurally outside both the interactive walk and the heading/alert capture below. Scope into the container first (`scope:{ref}` or `scope:{css}` — e.g. the drawer's own `role="dialog"` element) and re-read; the same plain text that was invisible unscoped now appears as a normal captured row with a `text`-strategy locator. This is deliberately **not** on by default for an unscoped read — doing that on every page with any static text at all would blow up every `browser_read` response's size for little benefit; scoping into a container is already a deliberate "show me everything in here" signal, so that's the only place it activates. If `browser_act`'s `target` resolution comes back `not_found` for something you can see on screen, this is the first thing to check — the error message says so directly. **If two of these text rows show the identical value** (a line-item price and the Subtotal happening to both read "SEK 700"), neither gets its own ref — captured text is only surfaced when it's unique within the scope, on purpose, rather than guessing which occurrence is which. That's not a gap to work around with a positional guess; assert on a container that legitimately contains the value instead (`toContainText` on the dialog/row ref) — see `ref-codegen-schema` for the exact assertion shape.
- **Locator priority (chosen by the derivation, for your awareness)** — highest unique tier wins: testid (`getByTestId`) → testid-xpath → stable id → role+name (`getByRole` exact) → label/placeholder/text → attribute combo → scoped row → sibling text (no accessible name from any source — broken/unlabeled markup only) → positional (`nth`). Semantic `getBy*` first; XPath for attribute/id/positional; **never CSS**.
- **Live-region exception (name from content):** `alert`, `status`, `log` (and other live-region/display roles) do **not** take their accessible name from their text — only from author markup (`aria-label`/`aria-labelledby`). Never capture their visible message as a role *name*: `getByRole('alert', { name: '<message>' })` matches nothing. The derivation locates them by **role alone** (`getByRole('alert')`) and `browser_read` marks them; assert the message text with `verify_*` → `toContainText`, not a name filter.
- **Uniqueness [CRITICAL]:** each locator is verified to resolve to exactly **1** element at capture. A `nth`/ambiguous element is marked **low confidence** and surfaced — escalate (re-read → `browser_diagnose` → `vindicate_ask_user`) so the user can supply a better anchor; do not coerce with `.filter()` / `.first()` / `.nth()` / `.last()`.
- **Two different, both-real elements sharing an accessible name (different roles)** — confirmed live: a cart drawer's actual "Checkout" navigation `link` sitting next to an `[expanded]` "Checkout" toggle `button` (a disclosure control, not navigation). Neither is broken or ambiguous on its own — this is not the `nth`/uniqueness case above — but a name search alone can't tell them apart. A line ending in `— same name as @<ref> (<role>) — verify which is the real target` is `browser_read` naming the other one(s) explicitly; use the role (and any other badges, e.g. `[expanded]` for a disclosure toggle) to judge which is the real target rather than picking by name match alone.
- **Click-delegate controls (no locator, or `[click only — check/uncheck unsupported]`):** some custom widgets (a checkbox/radio row in a multi-select, a styled payment-method radio) render the actual interactive control in a way a real click can't reliably land on — either `pointer-events: none`, or the "visually hidden native input" pattern (a real `<input>` collapsed to an explicit 1x1px box — e.g. Tailwind's `sr-only` — with a styled sibling/label representing it visually; confirmed live on a Klarna/Stripe checkout's "Credit or debit card" radio, where the 1px target let a neighbouring icon or a sticky header intercept the click on almost every attempt). Both delegate the real click handling to a wrapping row (`cursor: pointer`) — a common pattern, not a bug you can request the app fix. `browser_read` derives the locator from that wrapping row instead when it can find one, but the control's reported role/name is still its own. Use **`click`** on it, never `check`/`uncheck` (those require a real checkbox/radio and will fail fast rather than hang). If `browser_read` shows `[no locator — cannot be reliably automated]`, no safe click target exists at all — escalate, don't retry.
- **Elements inside an iframe** (embedded checkout, payment widgets, third-party forms — Stripe/Klarna/PayPal-style): `browser_read` sees into `<iframe>` content automatically, same-origin or cross-origin, up to a bounded nesting depth — no special action needed to "enter" the frame. Such an element's line ends in `[… — in iframe: <hop>]` or `[… — in nested iframe ×N: <hop1> > <hop2> …]`, where each `<hop>` names the real identity (`id=<value>`, `<attr>=<value>`, or the verified XPath) `browser_read` resolved that iframe host to — **use these hop identities verbatim when hand-authoring `frame_path`** rather than guessing from a visible `title`/label; two iframes can share the same visible title (common with Stripe/Klarna-style widgets) while only one carries a stable `id`. **A page can also carry two structurally-identical elements** — same role, name, and even the same `frame_path` shape — where one is a third-party SDK's pre-mounted-but-hidden widget and the other is the real, user-facing one revealed only after a specific selection (a payment method, a tab); a line ending in `— not visible` is that hidden instance — prefer the visible candidate when more than one line matches what you're looking for. **A duplicate can also be purely temporal, not hidden at all** — confirmed live: a payment provider (Klarna+Stripe) mounted a fresh card-input iframe the instant "Credit or debit card" was selected, while the pre-selection instance stayed attached and fully visible-by-every-static-signal for a while before eventually being torn down. A line ending in `— replaces @<ref> — prefer this one` is `browser_read` telling you exactly that: this element just appeared this read (`added`) and an older element with the identical role+name is still listed — the old one isn't broken yet, but it's stale and can disappear mid-interaction (a scoped read or act against it then fails with `"...could no longer be located"`); always prefer the one carrying `replaces`, and if you already acted on the other one, re-read fresh before continuing. This signal only appears from the second read in a session onward (nothing to diff against on the first). Its captured `locator` carries the same `frame_path`, which `browser_act` and codegen both resolve into a `frameLocator()` chain automatically — **prefer finalizing a recording (Phase 2) over hand-typing this array**, since a recorded capture carries the verified `frame_path` straight through with no risk of transcription error. Very deeply nested or off-screen/zero-size iframes (tracking pixels, hidden SDK plumbing) are deliberately not descended into — if a widget you can see on screen truly doesn't appear, treat it like any other capture gap (re-read scoped, then escalate), not a reason to fall back to human recording. **Recordings carry this too**: a click/fill inside an iframe — whether the human physically clicked inside it, or the agent acted on a `frame_path`-carrying ref during `mode:'auto'` recording — is captured with the same `frame_path`, so `depends_on` precondition replay resolves it inside the right iframe rather than the top page. One gap: a manual **Snapshot**/Stop page-state capture (the full-page element list, not the click itself) only covers the top frame today — iframe content simply won't appear in that specific snapshot's element list, though the click that happened inside it is still recorded correctly.
- **Popups during recording (`mode:'auto'` or human-record).** An agent's own `new_tab`/`switch_tab`/`switch_tab_by_url`/`close_tab` calls are recorded verbatim while `browser_record_start mode:'auto'` is active — no extra step needed, just call them as you normally would when a popup opens (see the popup bullet above). During **human** recording, a site-opened popup is detected automatically (no action from you) and recorded as a `switch_tab_by_url` step the instant it appears, with a matching step recorded when it closes — the human never has to do anything for this to work correctly, and the review panel labels these steps "Switched to tab: …". One gap: these tab-switch steps are captured for replay fidelity (`depends_on` precondition replay) and shown in the human review UI, but `generate` does not yet translate them into generated Playwright test code — a recorded flow that goes through a popup still needs that hop described in `pre_conditions`/`summary` for `generate` to act on, the same as today.
- **Multi-step embedded checkout widgets reveal fields in waves, not all at once** (confirmed on Klarna: email + postal code first; name/address/phone appear only after postal code triggers a lookup; card fields don't exist in the DOM at all until a payment method is actively selected deep in the flow). Don't read once and conclude a field is missing — fill what's visible, re-read, and expect more fields each time. A button that *looks* like "autofill the form with test data" may actually be a reference panel of values to copy (Klarna's "Test Data" opens a card-number lookup panel, not an autofiller) — if clicking it doesn't visibly populate fields, treat it as informational, re-read to check whether it opened a blocking overlay, and don't rely on it having filled anything.
- **A click that opens a popup/new window** (a "Pay with card", "Sign in with Google"-style OAuth/payment button — confirmed on Klarna's own "Pay order" opening a BankID login popup): the popup is a **separate browser tab**, not an iframe — `browser_read` on the page you're still on cannot see it, and looks completely normal (no error, no obviously-missing content) even though a new window just opened elsewhere. Watch for the proactive `⚠️ N other tab(s) open: "<url>" — call browser_navigate switch_to_url:'<part of the url>'` banner at the top of the **next** `browser_read` after such a click — that is the only signal you get. Then: `browser_navigate switch_to_url:'<part of the url>'` to make it the active tab (this waits briefly for the tab if it's still mid-redirect — a site-opened popup routinely starts on an intermediate loading/bounce URL before reaching the one you'd recognize, so a pattern that doesn't match on the very first try is not necessarily wrong, retry once after a short pause); `browser_read`/`browser_act` then work on it exactly like any other page. **When you close it or it closes itself** (finishing an OAuth flow, a "Cancel" button), the session automatically falls back to the remaining tab — no special handling needed, just `browser_read` again to see where you landed. If `switch_to_url` genuinely never matches, it means no such tab exists — don't guess `browser_navigate(new_tab:true)` as a fix for a tab the *site* was supposed to open, that only helps when *you* meant to open one yourself.
- **Dynamic & optional capture:** when an element's identifying value is runtime-driven, record the pattern with a `{param}` placeholder and mark it `dyn_param` (e.g. `delete-product-{id}`) — the only place a human/agent judgement (parameterization) sits over the derived locator; when an element appears only sometimes (cookie banner, promo, onboarding tip), flag it **optional** so `generate` uses `click_if_visible` rather than an unconditional click.
- **Strategy marker** per element mirrors the structured locator: one of `testid | testid_xpath | dom_id | role_name | label | placeholder | text | attr_combo | scoped | sibling_text | nth | dyn_param` (becomes the `// locator-helper:` comment when `generate` writes the field).
- **Forbidden globally:** CSS selectors of any form (`[attr=…]`, `.class`, `#id`), `.or()` chains, `.filter()`/`.first()`/`.nth()`/`.last()` coercion. Semantic `getBy*` and XPath are both allowed.
- **Rich interactions:** use `browser_act hover` to reveal menus before clicking hidden items; prefer `fill` over `type` for value-set (incl. range sliders); `drag` requires source `ref` + `to_ref` (drop target). Recorded steps use worker labels (`fill`, `drag`, `dblclick`, `upload_file`). **`fill` can silently no-op on some React-controlled inputs** — it sets the DOM value directly, and a component whose state is driven off key/input events rather than the native setter can discard that and re-render empty even though `fill` itself reports `ok:true`. Watch for a `hint` field in the `browser_act` response calling this out (it appears whenever a non-empty `fill` reads back empty right after); when you see it, retry with `browser_act action:'type'` on the same ref/value instead — that sends real per-character key events, which these components do observe. Don't assume this on every empty-looking field pre-emptively; only act on the explicit hint (or a re-read that shows the field still empty after a fill you were confident should have worked). When persisting this as generated code, use codegen's `type` action (`ref-codegen-schema`) — `fill`/`type` there mirror `browser_act`'s two modes exactly.
- **`browser_fill_form` — filling several fields at once.** Once a `browser_read` shows every field you need, filling them one `browser_act` call at a time is pure round-trip overhead for no benefit — `browser_fill_form` takes a list of `{ref, action, value}` and runs them in one call (`action` is `fill`/`type`/`check`/`uncheck`/`select`). It only ever acts on refs you already have — it never resolves a fuzzy `target` and never re-reads mid-batch — so **only include fields that are already visible in your last read**. Do **not** use it for a form that reveals new fields as you fill earlier ones (a postal code triggering an address lookup, a country select revealing a state field, Klarna's wave-revealed checkout fields — see above): a field that doesn't exist yet has no ref to give it, so fill what's currently visible with `browser_act` instead and re-read after each step, same as before this tool existed. It stops at the first field that fails and tells you exactly which one (by ref) and which ones before it were already set — re-read to confirm the failed field's actual state (it may have partially applied), then finish the rest with `browser_act` one at a time; it does not retry or continue past a broken field on its own.
- **Driving dynamic pages:** refs are valid on the current page and **reset on navigation** — re-read after a URL change (for click round-trips, `browser_act` includes `url_before`/`url_after`/`url_trail`). On a combobox, **Enter is ambiguous** (it may select a suggestion *or* submit the form) — prefer clicking the suggestion, or `ArrowDown` then `Enter`. A large open overlay (calendar / listbox / dialog) is folded into a single summary row by `browser_read` — `scope` into it (by `ref` or `css`) to read its items. After typing into an autocomplete, `browser_read` settles briefly so async results are captured.
- **Submit timing evidence for `generate`:** observe what each submit actually does — **do not assume login ⇒ `waitForResponse`.**
  - **XHR on submit** (login, search, save, checkout, …): click submit once during ai-explore; record real request URL path substrings from `browser_act` `url_trail` (or `browser_act wait_for_response`). Carry forward as `observed_endpoints` for `generate` when the schema will use `waitForResponse`. Use the app's actual path (e.g. `/web/index.php/auth/validate`) — **never** copy doc placeholders like `/auth/validate` or `/api/login`. Happy and negative paths often share one endpoint.
  - **Redirect only** (full navigation, no interceptable XHR): note the post-submit URL from `url_after` / `url_trail`; `generate` uses `waitForURL` — **omit** `observed_endpoints`.
  - **Sync submit** (same page, no async work): no extra wait beyond the click.
- **Capture only.** Do not edit `pages/`, `panels/`, `clients/`, `builders/`, or `tests/` here.

## Mode slices

### ai-explore (default)
Explore and record are **two separate phases** — do not record while exploring (speculative clicks and dead-ends pollute the artifact).

**Phase 1 — explore & capture (NO recording).**
1. Open a headed session at the URL.
2. `browser_read` for the a11y snapshot + interactive controls (default includes `h1`–`h6` / `role=alert|status` verify targets).
3. Draft each locator per the Locator rules; verify uniqueness via the ref count.
4. Carry the validated element identities forward in-context (they feed `design`/`generate`).
5. For each submit step the story will need: observe submit behavior (XHR vs redirect vs sync) and record `observed_endpoints` **only when** an XHR was seen (see Submit timing evidence rule).

**Phase 2 — record a clean pass** (only for a **new story flow with no existing recording**, to grow the reusable library). **Do not skip this for a flow with any `frame_path`-carrying element** (iframe-embedded checkout/payment/third-party widgets) — a hand-typed `frame_path` reconstructed from memory or a screenshot, instead of the recording's verified `StructuredLocator`, is exactly how a duplicated or mis-scoped iframe hop reaches codegen and fails at first test run (see the iframe bullet above).
- **Phase checkpoint — all three must hold before `browser_record_start`:** (a) every needed locator is captured and uniqueness-verified; (b) you have written out the exact ordered step list you are about to record; (c) you have **reset to a fresh start** — re-navigate to the start URL (or reopen the session) so no Phase-1 exploratory cruft leaks into the artifact. The reset is what guarantees a clean recording.
- **Handle prerequisites manually first.** Pre-condition playback is a webview feature for *human* recording only — it is NOT automatic here. Check `depends_on` from step 1; if this flow needs prior state (e.g. "must be logged in"), perform those steps now with `browser_navigate`/`browser_act` **before** starting the recording — they will NOT appear in the artifact.
- `browser_record_start session_id, name:'<scenario>', mode:'auto'`, then **replay the written step list deliberately**: do not retry failed clicks speculatively; one recording = one flow (don't navigate out of scope mid-recording); utility actions (`get_cookies`, `wait_for_response`) are ignored by the recorder, but tab actions (`new_tab`/`switch_tab`/`switch_tab_by_url`/`close_tab`) are **not** — they're recorded like any other step, so if the flow goes through a popup, call `switch_tab_by_url` as normal (see the popup bullet above) rather than avoiding it.
- If anything goes wrong → `browser_record_discard session_id`, then report what failed and why.
- `browser_record_finalize` with `pre_conditions` (what must be true before running), `post_conditions` (state after), `depends_on` (prerequisite recording names from step 1), `summary` (one paragraph).

**Close** the session.

### human-record (combined fallback — human explores *and* records)
Chosen at entry only when the AI can't drive the flow (auth wall/captcha) — the human does the exploration and the recording in one session, so this replaces both ai-explore phases.
1. Open a headed session at the starting URL (`headless:false`).
2. **Handle authentication before handing off** (if the app requires login): ask for credentials via `vindicate_ask_user` if not provided; complete login with `browser_navigate`/`browser_act` so the user starts recording already authenticated. Do **not** use `browser_read` in this mode — it isn't needed.
3. `browser_record_start session_id, name:'<scenario>', mode:'human'` — this **blocks** until the user Finalizes in VS Code. Tell the user (use this wording):
   > "The browser is open and recording. Drive through the scenario naturally — click, type, navigate as you normally would.
   >
   > A red **Recording…** banner appears top-right. Use **Snapshot** anytime to capture full page state (errors, validation). When done:
   > 1. Click **Stop** in the banner (captures final page state)
   > 2. Review steps in the VS Code recording tab (check selectors, delete noise)
   > 3. Click **Finalize** — I'll pick up automatically."
4. **Do NOT attempt to highlight elements** — highlighting is disabled during recording mode; the recorder overlay is the only injected UI.
5. On return (user finalized): `browser_record_get name` → compact markdown (interaction flow + page snapshots). These locators are **historical** — do **not** replay them with `browser_act`; use `browser_read` on a live session if you drive again.
6. `browser_record_annotate name` with `pre_conditions`/`post_conditions`/`depends_on` (from step 1)/`summary` inferred from the recording.
7. `browser_session action:'close'`.
   - Recording timeout → call `browser_record_get` after the user confirms they finalized in VS Code.
   - Empty recording → ask the user to re-record with at least one interaction step.

### source-scan (automatic prep when `app_source_found == true`)
Read the product source files directly to harvest selector + route hints (testid attributes, `getByRole` targets, router paths). Use these as element identity to inform capture/codegen **in-context** — prefer them over live browsing where they resolve, and fall through to `ai-explore` for anything unresolved. Nothing is persisted to a memory file.

### recording-ingest (user provided a recording to automate)
The recording **is** the grounding — a finalized artifact already carries the ordered flow + each interacted element's **identity** (`role`/`name`/`testid`/`tag`) + ranked `candidates`. Ingest it for code generation; do **not** re-explore live.
1. `browser_record_list` → confirm the recording exists; `browser_record_read` (or `browser_record_get` immediately after a human finalize) → the compact flow + page snapshots.
2. Extract each interacted element's **identity** and the ordered steps; carry them forward in-context for `generate` (the recording artifact itself is the durable evidence). **Skip live browsing.**
3. **Don't blindly trust `chosen`.** Apply the derived-locator priority (Locator rules): if a `chosen` candidate is flagged `dynamic` (auto-generated id), prefer `testid`/`role+name` from its `candidates` instead. **Same call for a `dom_id` candidate inside a third-party payment iframe** (Klarna/Stripe/PayPal/Adyen-style) even when it isn't flagged `dynamic` — these widgets are confirmed to reissue different, individually normal-looking ids across independent sessions (the same Klarna checkout field carried `id="billing-email"` in one grounding and `id="email"` in another — neither looks auto-generated on its own, so the `dynamic` pattern-match can't catch it), unlike a same-origin field the site owner controls. Prefer `role_name`/`label` from `candidates` there instead, falling back to `dom_id` only if neither exists. Mark runtime-driven values `dyn_param`; flag sometimes-absent elements `optional`.
4. **Action-name note for `generate`.** Recordings use *worker* action names; codegen uses *canonical* ones — `press_key → press`, `upload_file → upload` (`fill`/`select`/`check`/`hover`/`drag`/`dblclick` pass through). The translation is applied when `generate` builds the schema (`ref-contract`).
5. **Trust by default**; optionally spot-verify only `dynamic`/low-confidence elements with one `browser_read` **if** a session is cheaply available. Staleness (app changed since the recording) surfaces later in `execute`/`heal`.
6. Caveat: recorded locators are **historical for `browser_act`** (refs reset on navigation). This mode feeds **code generation**, where identity is sufficient and no live ref is needed.

### api-ingest (API feature grounding — no browser involved)
The grounded unit is a **per-endpoint record**, regardless of source: `method`, `path`, `auth`
(scheme — Bearer/Basic/API-key/cookie — and where the credential comes from), `request body shape`
(fields + types, or "none"), `response shape` (status code(s) + the response fields worth asserting
on). Every source below normalizes to this same shape; carry the resulting list forward in-context
for `generate`, the API equivalent of `elements_captured`.

1. **Read whatever the user gave, directly — no parser tool, no new skill.** An OpenAPI/Swagger doc
   (JSON/YAML), a Postman/Insomnia collection, a pasted curl command, or a plain chat description are
   all just text — read and interpret them the same way `source-scan` reads app source. Prefer the
   most authoritative source available: OpenAPI/collection > a real curl example > a chat description.
2. **Fill genuine gaps with `api_request`, not by asking or guessing first.** If the given source
   doesn't fully specify a response shape (or nothing was given beyond "there's a login endpoint"),
   call `api_request` once to see the real response — the API equivalent of "never invent a locator,"
   verify against the real system instead of hallucinating a shape.
3. **Never call `api_request` when the given source is already complete.** A full OpenAPI operation
   or a working curl example is trusted as-is — re-probing it anyway is wasted latency for no benefit.
   The first real verification happens naturally when the generated test runs in `execute`.
4. **Ask only when neither a source nor a live probe can resolve it** — typically a credential you
   don't have and can't reasonably obtain. `vindicate_ask_user` once, structured.
5. **Capture the auth mechanism as its own piece of evidence**, not just per-endpoint detail: is there
   a login/token endpoint (get-once, reuse — see `generate`'s auth-setup pattern), a static API key,
   or no auth at all? This determines whether `generate`'s `create` op needs to wire a token-once
   fixture.
6. **Strip the leading `/` when carrying `path` forward.** An OpenAPI `paths` key is always
   leading-slash by spec (`/pet/{petId}`); a `servers[].url`/base URL is conventionally written
   *without* a trailing slash (`https://petstore.swagger.io/v2`). Carried through unchanged, that
   combination breaks at request time — Playwright's `APIRequestContext` treats a leading-slash path
   as absolute and drops any base-path segment (`/v2` vanishes), while a relative path (no leading
   slash) joins onto it correctly. Ground `path` as relative every time (`generate`'s schema
   enforces this — `leading_slash_path`).
7. **Watch for int64 ids on older/demo-style APIs** (Petstore-shaped backends are the common case).
   JS/JSON silently lose precision above `Number.MAX_SAFE_INTEGER`, so an id like
   `9223372036854775807` returned by a POST that omitted its own id will not round-trip through a
   later GET by that id. Not an Vindicate bug — a JS-ecosystem limitation — but worth a note back to
   the user, and prefer sending an explicit, safe test id on create rather than relying on a
   server-generated int64 one.

## Output
- Captured element identities carried forward in-context (`elements_captured`) for `design`/`generate`.
- `api-ingest`: captured endpoint records (`endpoints_captured`) + the auth mechanism, carried forward in-context for `generate`.
- Submit timing evidence: `observed_endpoints` when a submit XHR was observed; post-submit route notes when redirect-only (for `generate` → `waitForURL`). Omit both when submit is sync.
- New flows: a finalized recording artifact (name + path) annotated with pre/post/depends_on/summary.
- Carried forward: `pages_visited`, `elements_captured`, `recording_name`/`recording_path` (when recorded).
- **Report (chat):** one line — e.g. `🔍 Captured N elements across M page(s)` (+ `· recorded "<flow>"` when a recording was made).

## Transitions
- `write` — required elements captured/validated; submit timing evidence recorded when the story includes async submits (XHR paths in `observed_endpoints`, or redirect route noted for `waitForURL`) → **design**
- `fix` — the failing element re-captured → **generate**
- `gaps` — screens mapped against the test inventory → **coverage**

## Escalation
- App unreachable → stop; report the URL tried.
- Login blocked → request credentials via `vindicate_ask_user`.
- **Locator ambiguous/unreachable after the 3-attempt cap → escalation ladder:** (1) `browser_read` (or re-read scoped to the area), (2) if still stuck, one `browser_diagnose` to see *why* (overlay, validation, missing prior action), (3) `vindicate_ask_user` with OPTIONS: retry with a different locator strategy, paste the exact selector, or switch to human recording. **Never** auto-force human recording as the sole fallback.
- Empty/failed recording → `browser_record_discard`; ask whether to re-record with a clearer starting state.

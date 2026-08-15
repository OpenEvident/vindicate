---
ref: ref-recipes
pulled_into: [generate]
note:
  Worked patterns for the cases plain create/add_test_cases don't cover head-on — optional/ad-hoc
  UI, runtime-parameterized locators, and advanced widgets (date pickers/calendars). Codegen handles
  the locator + conditional primitives; the multi-step orchestration (loops, runtime capture, relative
  dates) is direct `.ts` edit. Each recipe says which half is which.
---

# Recipes (reference)

Three production patterns. Each shows what codegen emits vs. what is a direct `.ts` edit. All obey the
locator protocol (derived structured locator, one strategy/element, semantic `getBy*` first; no CSS) and
keep **all logic out of the spec body**.

## 1. Optional / ad-hoc elements (popups, cookie banners, promos)

Elements that appear only sometimes must never be clicked unconditionally. Use the `click_if_visible`
action (codegen) → it calls the `clickIfVisible(locator, timeout = 2000)` helper on `BasePage`/`BasePanel`.

Schema (inside a `step_*`):

```json
{ "do": "click_if_visible", "ref": "cookieAccept", "timeout": 3000 }
```

Emits:

```ts
async step_dismiss_banners(): Promise<this> {
  await this.clickIfVisible(this.cookieAcceptButton, 3000);
  return this;
}
```

Put it as the first step of a flow (or in `before_each`) so later steps aren't blocked. For an optional
element whose _presence decides a branch_, write the `if` inside the page-object method — never the spec.

## 2. Dynamic locators from runtime data (CRUD: edit/delete the row you created)

When the selector embeds a value only known at runtime (`delete-product-<id>`, `order-row-<orderNo>`),
declare the element `dynamic` with a `{param}` placeholder. Codegen emits a locator **method**; actions
pass the value via `refArgs` (sourced from a step param).

Element + step (codegen):

```json
{
  "ref": "deleteBtn",
  "tag": "button",
  "testid": "delete-product-{id}",
  "testid_attr": "data-testid",
  "dynamic": [{ "name": "id", "type": "string" }]
}
```

```json
{
  "name": "step_delete_product",
  "params": [{ "name": "id", "type": "string" }],
  "actions": [{ "do": "click", "ref": "deleteBtn", "refArgs": ["id"] }]
}
```

Emits:

```ts
private deleteProductButton(id: string): Locator {
  return this.page.locator(`//*[@data-testid="delete-product-${id}"]`);
}
async step_delete_product(id: string): Promise<this> {
  await this.deleteProductButton(id).click();
  return this;
}
```

**Where the id comes from:**

- _Seeded / known value_ → pass through the spec as `expected.<key>` or `process.env.X!`. Fully
  `create`-able.
- _Captured during the test_ (you created the product, the app returned its id) → add a getter
  `async get_lastCreatedId(): Promise<string>` (returns a value; exempt from `Promise<this>`), then in
  the spec **direct-edit** to capture and pass it. `create`'s spec writer only emits flat calls, so write
  this by hand:
  ```ts
  // tests/products.spec.ts — direct edit
  test("[AC-3] should delete the product it created", async ({ productsPage }) => {
    await productsPage.step_create_product(expected.newProduct);
    const id = await productsPage.get_lastCreatedId();
    await productsPage.step_delete_product(id);
    await productsPage.verify_row_removed(id);
  });
  ```
  A `const x = await …` capture is allowed in a spec; `if/for/while/throw/try` and bare `expect()` are not.

## 3. Calendars / date pickers (e.g. booking.com check-in / check-out)

A calendar widget = three moving parts: open the picker, page to the right month, click the day cell —
and the date itself is dynamic. Model the widget as a **Panel** (reused across pages) and write its
month-paging loop as a **direct edit** (codegen can't emit loops); the day cell is a `dyn_param` locator.

`panels/CalendarPanel.ts` (direct edit — `register_page` with `is_panel:true` can scaffold the static
locators first, then hand-edit in the loop):

```ts
import { BasePanel } from "./BasePanel";
import { Locator } from "@playwright/test";

export class CalendarPanel extends BasePanel {
  // locator-helper: testid
  private monthLabel = this.page.getByTestId("calendar-month");
  // locator-helper: testid
  private nextMonthButton = this.page.getByTestId("calendar-next");
  // locator-helper: dyn_param
  private dayCell(date: string): Locator {
    return this.page.locator(`//td[@data-date="${date}"]`);
  }

  /**
   * Pages forward to the target month, then clicks the day cell.
   * @param date - ISO date 'YYYY-MM-DD'
   * @returns this for chaining
   */
  async step_pick_date(date: string): Promise<this> {
    const targetMonth = date.slice(0, 7); // 'YYYY-MM'
    for (let i = 0; i < 24; i++) {
      const shown = (await this.monthLabel.getAttribute("data-month")) ?? "";
      if (shown === targetMonth) break;
      await this.nextMonthButton.click();
    }
    await this.dayCell(date).click();
    return this;
  }
}
```

`pages/BookingPage.ts` composes the panel and computes **relative** dates (so tests never go stale).
Date math lives in the page method — never the spec:

```ts
readonly calendar = new CalendarPanel(this.page);

/**
 * Books a stay starting `checkinInDays` from today for `nights` nights.
 * @returns this for chaining
 */
async step_book_stay(checkinInDays: number, nights: number): Promise<this> {
  const iso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  await this.checkinFieldButton.click();
  await this.calendar.step_pick_date(iso(checkinInDays));
  await this.checkoutFieldButton.click();
  await this.calendar.step_pick_date(iso(checkinInDays + nights));
  return this;
}
```

Spec stays declarative: `await bookingPage.step_book_stay(1, 3);` (check in tomorrow, 3 nights).

> Same shape applies to other advanced widgets (steppers, sliders, autocompletes): static controls are
> normal locators, the per-item target is a `dyn_param` method, and any iteration/branching lives in a
> page/panel method.

---

## Drag & drop

Use `browser_act` with `action:"drag"`, the **source** `ref`, and **`to_ref`** (drop target from
`browser_read`). Default strategy is **manual** (mouse down → move → up); pass `strategy:"native"` when
the control is a native HTML5 draggable.

Generated tests call `this.dragTo(sourceLocator, targetLocator)` on `BasePage`/`BasePanel` — the helper
mirrors the worker (manual bounding-box centers vs `source.dragTo(target)`).

```ts
// Exploration (live session)
browser_act session_id, action:"drag", ref:"ref-a1b2c3d4", to_ref:"ref-e5f6a7b8"
browser_act session_id, action:"drag", ref:"ref-a1b2c3d4", to_ref:"ref-e5f6a7b8", strategy:"native"

// Generated page object (codegen)
await this.dragTo(this.dragHandleDiv, this.dropZoneDiv);
await this.dragTo(this.dragHandleDiv, this.dropZoneDiv, { native: true });
```

---

## Custom `role=slider` value-set

Native `<input type="range">` accepts `fill` with the target value string. Custom ARIA sliders need
keyboard stepping or drag:

1. Read `aria-valuenow`, `aria-valuemin`, `aria-valuemax` from `browser_read`.
2. Prefer **keyboard** (`ArrowRight` / `ArrowLeft` / `Home` / `End`) via `browser_act press` until
   `aria-valuenow` matches the target — stable for most design-system sliders.
3. Fallback: `browser_act drag` from the thumb ref to a track position ref (manual strategy).

Codegen: range inputs use `{ do:"fill", ref:"volumeRange", value:"75" }` → `.fill("75")`.

---

## File upload fixtures

**Exploration** — `browser_act upload` with `sample:"image"|"pdf"|"csv"|"txt"` sends the kind to the
worker; the worker resolves its local `assets/samples/` path. No project files or MCP-side paths required.

**Generated tests** — commit real files under `support/data/<feature>/` and emit project-root-relative
paths:

```ts
await this.attachmentInput.setInputFiles(["support/data/kitchen/invoice.pdf"]);
```

Paths resolve from the Playwright project root in CI. Never hardcode absolute paths in generated code.

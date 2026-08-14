/**
 * @file The structured locator — the single, render-agnostic description of how one element is
 * targeted. Derived and uniqueness-verified once at capture (runtime-worker, live DOM), carried on
 * the snapshot wire and in `.vindicate/elements.json`, and rendered by each consumer:
 *   - the runtime resolver → a live Playwright `Locator`
 *   - codegen → Playwright source in a page object
 *   - the recording path → a candidate of the same vocabulary
 *
 * It carries *data*, never a finished Playwright call. Rendering rule across consumers:
 * semantic `getBy*` first; XPath for attribute / id / positional tiers; CSS is never emitted.
 */
import { z } from "zod";

/**
 * The locator tiers, in priority order. Capture picks the highest tier that resolves to exactly one
 * element against the whole document.
 *
 * - `testid`        — element carries the project's configured test-id attr → `getByTestId(value)`
 * - `testid_xpath`  — a recognised but non-project test-id attr → `//*[@attr="value"]`
 * - `dom_id`        — a real, non-generated `id` → `//*[@id="value"]`
 * - `role_name`     — role + unique locator-grade accessible name → `getByRole(role,{name,exact})`
 * - `label`         — role-less control labelled via <label>/aria-label → `getByLabel(value)`
 * - `placeholder`   — role-less input with a placeholder → `getByPlaceholder(value)`
 * - `text`          — role-less element matched by visible text → `getByText(value,{exact})`
 * - `attr_combo`    — a unique stable attribute combination → `//tag[@a="x"][@b="y"]`
 * - `scoped`        — a per-row control scoped to its uniquely-named container row
 * - `sibling_text`  — no accessible name at all (broken/unlabeled markup), but exactly one sibling
 *                      carries unique text → `//tag[preceding-sibling::*[...] or following-sibling::*[...]]`.
 *                      Never fed into `getByRole`/`getByText` name matching — Playwright's own
 *                      accessible-name algorithm doesn't look at unrelated siblings either, so that
 *                      would produce a locator nothing resolves. This is a real, verified-unique XPath
 *                      structural match, rendered the same way as `attr_combo`/`nth`.
 * - `nth`           — positional last resort → `(…)[n]` (always low confidence)
 */
export const LOCATOR_STRATEGIES = [
  "testid",
  "testid_xpath",
  "dom_id",
  "role_name",
  "label",
  "placeholder",
  "text",
  "attr_combo",
  "scoped",
  "sibling_text",
  "nth"
] as const;

export const LocatorStrategySchema = z.enum(LOCATOR_STRATEGIES);
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

/** `low` marks a fragile result (positional `nth` or still-ambiguous) that should be surfaced. */
export const LocatorConfidenceSchema = z.enum(["high", "low"]);
export type LocatorConfidence = z.infer<typeof LocatorConfidenceSchema>;

/** Container anchor for the `scoped` tier (the uniquely-named repeating row to scope into). */
export const LocatorContainerSchema = z.object({
  role: z.string(),
  name: z.string()
});

/**
 * The verified, render-agnostic locator. Which optional fields are populated depends on `strategy`:
 *   - `testid`                          → `attr`, `value`
 *   - `testid_xpath` / `dom_id` / `attr_combo` / `sibling_text` / `nth` → `xpath` (the verified expression)
 *   - `role_name`                       → `role`, `name` (locator-grade, full accessible name)
 *   - `label` / `placeholder` / `text`  → `value`
 *   - `scoped`                          → `role`, `name`, `container`
 *   - `sibling_text`                    → `value` (the matched sibling text, for the `// locator-helper:`
 *                                          comment) *and* `xpath` — this is the one tier that populates both.
 */
export interface StructuredLocator {
  readonly strategy: LocatorStrategy;
  readonly confidence: LocatorConfidence;
  /** Attribute name for `testid` / `testid_xpath` / `attr_combo`. */
  readonly attr?: string | undefined;
  /** Value for `testid`, `label` / `placeholder` / `text`, and the matched text for `sibling_text`. */
  readonly value?: string | undefined;
  /** ARIA role for `role_name` / `scoped`. */
  readonly role?: string | undefined;
  /** Locator-grade accessible name (full, untruncated, never the test-id) for `role_name` / `scoped`. */
  readonly name?: string | undefined;
  /** Verified XPath expression for `testid_xpath` / `dom_id` / `attr_combo` / `sibling_text` / `nth`. */
  readonly xpath?: string | undefined;
  /** Container row anchor for `scoped`. */
  readonly container?: { readonly role: string; readonly name: string } | undefined;
  /**
   * Ancestor `<iframe>` host-element locators, outermost first, needed to reach this locator inside
   * nested iframe boundaries via Playwright's `frameLocator()` chaining. Absent/empty = not inside a
   * frame (the overwhelming common case — every existing call site that never sets this is unaffected).
   * Each entry locates one iframe *host element*, verified unique the same way as any other tier;
   * entries are restricted to the XPath-renderable strategies (`testid` / `testid_xpath` / `dom_id` /
   * `attr_combo` / `nth`) — an iframe is a structural boundary, not a role/text-bearing control, and an
   * entry never carries its own `frame_path` (this array's order already encodes the full nesting).
   */
  readonly frame_path?: readonly StructuredLocator[] | undefined;
  /**
   * Set when this locator was derived from a click-delegate ANCESTOR, not the element the agent asked
   * about — capture already resolved it this way (computed `pointer-events: none`, or a collapsed
   * ~1x1px sr-only-input box) because the original element can never reliably receive a click itself.
   * Carried on the locator (not just the live `browser_read` wire row) so it survives into a codegen
   * schema built from a verbatim copy: `click` on this locator is correct, but `check`/`uncheck` will
   * throw (the delegate is a plain container, not itself a checkbox/radio) — codegen surfaces this in
   * the generated `// locator-helper:` comment.
   */
  readonly click_delegate?: boolean | undefined;
}

export const StructuredLocatorSchema: z.ZodType<StructuredLocator> = z.lazy(() =>
  z.object({
    strategy: LocatorStrategySchema,
    confidence: LocatorConfidenceSchema,
    attr: z.string().optional(),
    value: z.string().optional(),
    role: z.string().optional(),
    name: z.string().optional(),
    xpath: z.string().optional(),
    container: LocatorContainerSchema.optional(),
    frame_path: z.array(StructuredLocatorSchema).optional(),
    click_delegate: z.boolean().optional()
  })
);

/** One `getByRole(role, { name?, exact })` step. `name` is omitted when there is no matchable name. */
export interface RoleInvocation {
  readonly role: string;
  readonly name?: string;
  readonly exact: boolean;
}

/**
 * The `getByRole` call chain for a `role_name` (one step) or `scoped` (container → target) locator —
 * the single decision both renderers share. Codegen formats each step as Playwright source; the live
 * resolver formats it as a chained `Locator`. Returns `undefined` for non-role strategies (each
 * consumer renders those itself).
 *
 * The key invariant lives here once: a step's `name` is bound only when it is non-empty. A role left
 * unnamed by capture (a name-prohibited role like `alert`) renders as bare `getByRole(role)` — never
 * `getByRole(role, { name: "" })`, which matches nothing.
 */
export function resolveRoleChain(loc: StructuredLocator): RoleInvocation[] | undefined {
  if (loc.strategy === "role_name") {
    if (loc.role === undefined || loc.role.length === 0) {
      return undefined;
    }
    return [roleStep(loc.role, loc.name, true)];
  }
  if (loc.strategy === "scoped") {
    if (loc.role === undefined || loc.container === undefined) {
      return undefined;
    }
    return [
      roleStep(loc.container.role, loc.container.name, false),
      roleStep(loc.role, loc.name, true)
    ];
  }
  return undefined;
}

function roleStep(role: string, name: string | undefined, exact: boolean): RoleInvocation {
  return name !== undefined && name.length > 0 ? { role, name, exact } : { role, exact };
}

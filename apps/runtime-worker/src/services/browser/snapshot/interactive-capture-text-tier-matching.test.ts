/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the `text` strategy tier's value computation: it must match Playwright's own
 * `getByText(value, { exact: true })` matching algorithm at act time, which concatenates raw text content
 * with no synthetic spacing between element boundaries — a genuinely different algorithm from the ARIA
 * "accessible name" computation `getByRole(role, { name })` uses (which the `role_name`/`scoped` tiers
 * correctly rely on `elementText`'s space-joining for; see the "Colombo" regression in
 * snapshot-engine.test.ts, which this fix must not reintroduce).
 *
 * Confirmed live against a real production timeout: a Klarna/Stripe checkout's "Credit or debit card"
 * payment radio's click-delegate `<label>` renders its name across two adjacent `<div>`s
 * ("Credit or debit card" / "Secure and encrypted") with no whitespace text node between them in the DOM.
 * `getByText("Credit or debit card Secure and encrypted", { exact: true })` (the space-joined,
 * accessible-name-style value the old code produced) matched **zero** elements; only the unspaced
 * concatenation `label.textContent()` itself reports — "Credit or debit cardSecure and encrypted" —
 * actually resolved, verified directly against the live site via `page.getByText(...).count()`.
 */
import { describe, expect, it } from "vitest";

import { captureInteractiveSnapshot } from "./interactive-capture.evaluate.js";

const baseOpts = {
  maxNodes: 100,
  testidCandidates: ["data-testid"],
  collapse: false,
  viewportOnly: false,
  includeVerifiable: false
};

describe("captureInteractiveSnapshot — text tier matches getByText's raw-concatenation semantics", () => {
  it("does not insert a synthetic space between adjacent block-level children (the real Klarna case)", () => {
    // Role-less (implicit role "generic") so this hits T5/text, not T4/role_name — tabindex="0" is only
    // here to make the element captured as interactive at all, mirroring how the real click-delegate
    // label (also role-less) is what actually exercises this tier, not the radio input itself. No
    // whitespace/newline between the two inner <div>s — matching the real Klarna DOM (React-rendered,
    // JSX-adjacent elements with no literal text node between them), not source-formatting indentation.
    document.body.innerHTML =
      '<div tabindex="0"><div>Credit or debit card</div><div>Secure and encrypted</div></div>';

    const result = captureInteractiveSnapshot(baseOpts);
    const el = result.elements.find((e) => e.tag === "div");

    expect(el?.locator?.strategy).toBe("text");
    // Raw textContent concatenation — no space where the DOM has none. This is deliberately the
    // *unreadable* run-together form; it is correct precisely because it is what getByText actually
    // matches, not because it is what a human would want to read (that's what the reported `name` field,
    // built from the ARIA-accessible-name-style getLocatorName, is for — see the next test).
    expect(el?.locator?.value).toBe("Credit or debit cardSecure and encrypted");
  });

  it("still space-joins the reported `name` field the same as before (getByRole path unaffected)", () => {
    document.body.innerHTML = `
      <button><span>Colombo</span><span>Colombo District, Sri Lanka</span></button>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const btn = result.elements.find((e) => e.role === "button");

    // Regression guard for the pre-existing fix this must not undo: role_name (getByRole matching) still
    // needs the ARIA-accessible-name-style space-joined value.
    expect(btn?.name).toBe("Colombo Colombo District, Sri Lanka");
    expect(btn?.locator?.strategy).toBe("role_name");
    expect(btn?.locator?.name).toBe("Colombo Colombo District, Sri Lanka");
  });

  it("produces identical text-tier and reported-name values when the name comes from a single text node", () => {
    // The overwhelming common case: no multi-element join at all, so both computations degrade to the
    // same normalized string — proving this fix only changes behaviour for the specific multi-block case.
    document.body.innerHTML = `<div tabindex="0">Just one line of text</div>`;

    const result = captureInteractiveSnapshot(baseOpts);
    const el = result.elements.find((e) => e.tag === "div");

    expect(el?.name).toBe("Just one line of text");
    expect(el?.locator?.value).toBe("Just one line of text");
  });

  it("collapses real whitespace runs the same way on both paths", () => {
    document.body.innerHTML = `<div tabindex="0">  Extra   spaced   text  </div>`;

    const result = captureInteractiveSnapshot(baseOpts);
    const el = result.elements.find((e) => e.tag === "div");

    expect(el?.locator?.value).toBe("Extra spaced text");
  });
});

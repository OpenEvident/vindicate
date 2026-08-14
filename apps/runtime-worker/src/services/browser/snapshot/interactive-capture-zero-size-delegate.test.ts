/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the click-delegate fallback's *other* trigger: a control that isn't
 * `pointer-events: none` but is collapsed to an explicit 1x1px box — the classic "visually hidden,
 * native input" accessibility pattern (Tailwind's `sr-only` and equivalents: real `<input>`, styled
 * sibling/label represents it visually). Confirmed as the actual cause of a real production timeout: a
 * Klarna/Stripe checkout's "Credit or debit card" payment radio (`class="sr-only"`,
 * `data-testid="payment-method-card-container"`, `pointer-events: auto`, computed `width:1px;
 * height:1px`) reproduced live against https://demo.kustom.co/ — Playwright resolves and scrolls the
 * input into view correctly, but at 1x1px a neighbouring payment icon or a sticky header intercepts the
 * exact pixel on almost every attempt, regardless of retries.
 *
 * Uses *computed* width/height (`isEffectivelyZeroSize` reads `getComputedStyle`, not
 * `getBoundingClientRect`) deliberately: happy-dom has no real layout engine, so `getBoundingClientRect`
 * always reports 0x0 for every element, which would make this trigger fire for every element in these
 * tests (a false positive on the "normal control" cases below) rather than only the ones that explicitly
 * declare a fixed 1px box the way the real sr-only pattern does. Computed style resolves an explicit
 * fixed-length inline style without needing layout, so it stays accurate in happy-dom and matches the
 * real-Chromium verification performed for this fix (which measured the exact same "1px"/"1px" via
 * `getComputedStyle` against the live site).
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

describe("captureInteractiveSnapshot — zero-size (sr-only) click-delegate fallback", () => {
  it("derives the locator from the click delegate when the control is collapsed to 1x1px", () => {
    document.body.innerHTML = `
      <label style="cursor: pointer;">
        <input type="radio" role="radio" data-testid="payment-method-card-container"
               style="width:1px;height:1px;overflow:hidden;position:absolute;pointer-events:auto;">
        <span>Credit or debit card</span>
      </label>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const radio = result.elements.find((e) => e.role === "radio");

    expect(radio).toBeDefined();
    // Reported identity stays the input's own — never silently swapped for the delegate's.
    expect(radio?.role).toBe("radio");
    expect(radio?.tag).toBe("input");
    // The locator, though, is derived from the delegate label's own text.
    expect(radio?.click_delegate).toBe(true);
    expect(radio?.locator?.strategy).toBe("text");
    expect(radio?.locator?.value).toBe("Credit or debit card");
  });

  it("reproduces the exact real Klarna checkout structure — delegate found AND the text value actually matches getByText", () => {
    // The real DOM this was diagnosed against: two adjacent <div>s with no whitespace text node between
    // them (React-rendered — no JSX literal whitespace), not a single <span>. Verified end-to-end live
    // against https://demo.kustom.co/'s Klarna checkout: getByText(value, {exact:true}) using the
    // space-joined accessible-name-style value (the pre-fix behaviour) matched zero elements; only the
    // unspaced concatenation this test pins actually resolves.
    document.body.innerHTML =
      '<label style="cursor: pointer;">' +
      '<input type="radio" role="radio" data-testid="payment-method-card-container" ' +
      'style="width:1px;height:1px;overflow:hidden;position:absolute;pointer-events:auto;">' +
      "<div>Credit or debit card</div><div>Secure and encrypted</div>" +
      "</label>";

    const result = captureInteractiveSnapshot(baseOpts);
    const radio = result.elements.find((e) => e.role === "radio");

    expect(radio?.click_delegate).toBe(true);
    expect(radio?.locator?.strategy).toBe("text");
    expect(radio?.locator?.value).toBe("Credit or debit cardSecure and encrypted");
  });

  it("prefers a testid on the delegate label when one exists", () => {
    document.body.innerHTML = `
      <label style="cursor: pointer;" data-testid="card-payment-option">
        <input type="radio" role="radio" data-testid="payment-method-card-container"
               style="width:1px;height:1px;pointer-events:auto;">
        <span>Credit or debit card</span>
      </label>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const radio = result.elements.find((e) => e.role === "radio");

    expect(radio?.click_delegate).toBe(true);
    expect(radio?.locator?.strategy).toBe("testid");
    expect(radio?.locator?.value).toBe("card-payment-option");
  });

  it("reports no locator at all when no click-delegate ancestor exists (never a broken one)", () => {
    document.body.innerHTML = `
      <div class="plain-wrapper">
        <input type="radio" role="radio" style="width:1px;height:1px;pointer-events:auto;">
        <span>ORPHANED</span>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const radio = result.elements.find((e) => e.role === "radio");

    expect(radio).toBeDefined();
    expect(radio?.click_delegate).toBeUndefined();
    expect(radio?.locator).toBeUndefined();
  });

  it("leaves a normal-sized control completely unaffected (no explicit tiny width/height)", () => {
    document.body.innerHTML = `
      <div>
        <input type="checkbox" id="normal-cb">
        <label for="normal-cb">Marketing emails</label>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.tag === "input");

    expect(checkbox?.click_delegate).toBeUndefined();
    // happy-dom doesn't implement document.evaluate, so the XPath-verified dom_id tier can't be confirmed
    // here (same documented limitation as interactive-capture-shadow-dom.test.ts) — degrades to the
    // still-correct, still-unaffected role_name tier instead.
    expect(checkbox?.locator?.strategy).toBe("role_name");
  });

  it("leaves an explicitly-sized-but-real control (e.g. a 40x40 icon button) unaffected", () => {
    document.body.innerHTML = `
      <button type="button" style="width:40px;height:40px;">Real Button</button>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.tag === "button");

    expect(button?.click_delegate).toBeUndefined();
    expect(button?.locator?.strategy).toBe("role_name");
  });

  it("does not treat a decorative cursor:pointer ancestor as a delegate when the control itself is a normal size", () => {
    document.body.innerHTML = `
      <div class="card" style="cursor: pointer;">
        <button id="real-btn" type="button" style="width:40px;height:40px;">Real Button</button>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.tag === "button");

    expect(button?.click_delegate).toBeUndefined();
    expect(button?.locator?.strategy).toBe("role_name");
  });

  it("bounds the ancestor search the same way as the pointer-events:none trigger", () => {
    document.body.innerHTML = `
      <div style="cursor:pointer;">
        <div style="cursor:default;"><div style="cursor:default;"><div style="cursor:default;">
        <div style="cursor:default;"><div style="cursor:default;"><div style="cursor:default;">
          <input type="radio" role="radio" style="width:1px;height:1px;pointer-events:auto;">
        </div></div></div></div></div></div>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const radio = result.elements.find((e) => e.role === "radio");

    expect(radio).toBeDefined();
    expect(radio?.click_delegate).toBeUndefined();
    expect(radio?.locator).toBeUndefined();
  });
});

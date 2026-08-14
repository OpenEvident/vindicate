/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the click-delegate fallback: a `pointer-events: none` control can never itself
 * receive a click (a hard browser fact, not a heuristic) — this is the actual cause of a real production
 * timeout ("<div class="ms-option"> intercepts pointer events" while trying to click a role=checkbox
 * whose only blocker was a CSS rule on the checkbox itself, delegating the real click handling to its
 * wrapper row). When capture detects this, it derives the locator from the nearest ancestor that can
 * actually receive the click (computed `cursor: pointer`, not itself pointer-events:none) instead —
 * reported role/name/tag stay the original element's own identity. No delegate found means no locator at
 * all, never one that would silently hang.
 *
 * Unlike `sibling_text` (T7b, XPath-verified — see interactive-capture-sibling-text.test.ts), the
 * delegate's own locator here resolves via the `text` tier (T5), which does not depend on
 * `document.evaluate` — so, unlike that file, these assertions are real and exact in happy-dom, matching
 * the real-Chromium verification performed for this fix.
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

describe("captureInteractiveSnapshot — click-delegate fallback", () => {
  it("derives the locator from the click delegate when the control itself is pointer-events:none", () => {
    document.body.innerHTML = `
      <div class="ms-option" style="cursor: pointer;">
        <span role="checkbox" tabindex="0" aria-checked="false" style="pointer-events: none;"></span>
        <span class="ms-option-label">GAY EVENT</span>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.role === "checkbox");

    expect(checkbox).toBeDefined();
    // Reported identity stays the checkbox's own — never silently swapped for the delegate's.
    expect(checkbox?.role).toBe("checkbox");
    expect(checkbox?.tag).toBe("span");
    expect(checkbox?.name).toBe("");
    // The locator, though, is derived from the delegate div's own text.
    expect(checkbox?.click_delegate).toBe(true);
    expect(checkbox?.locator?.strategy).toBe("text");
    expect(checkbox?.locator?.value).toBe("GAY EVENT");
    // Also stamped on the locator itself, not just the wire row — so a codegen schema built from a
    // verbatim copy of this locator still knows it's a click-delegate ancestor, not the real target.
    expect(checkbox?.locator?.click_delegate).toBe(true);
  });

  it("reports no locator at all when no click-delegate ancestor exists (never a broken one)", () => {
    document.body.innerHTML = `
      <div class="plain-wrapper">
        <span role="checkbox" tabindex="0" aria-checked="false" style="pointer-events: none;"></span>
        <span>ORPHANED</span>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.role === "checkbox");

    expect(checkbox).toBeDefined();
    expect(checkbox?.click_delegate).toBeUndefined();
    expect(checkbox?.locator).toBeUndefined();
  });

  it("bounds the ancestor search — a cursor:pointer element beyond the depth limit is not used", () => {
    // `cursor` is an inherited CSS property, so every plain wrapper between the blocked control and an
    // outer cursor:pointer element would *also* compute cursor:pointer via inheritance unless explicitly
    // reset — each wrapper here resets it to `default` so only the outermost div (7 levels up, beyond
    // the 6-ancestor search bound) genuinely carries the click affordance, and must not be found.
    document.body.innerHTML = `
      <div style="cursor:pointer;">
        <div style="cursor:default;"><div style="cursor:default;"><div style="cursor:default;">
        <div style="cursor:default;"><div style="cursor:default;"><div style="cursor:default;">
          <span role="checkbox" tabindex="0" aria-checked="false" style="pointer-events: none;"></span>
        </div></div></div></div></div></div>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.role === "checkbox");

    expect(checkbox).toBeDefined();
    expect(checkbox?.click_delegate).toBeUndefined();
    expect(checkbox?.locator).toBeUndefined();
  });

  it("leaves a normal (non-blocked) checkbox completely unaffected", () => {
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

  it("does not treat a decorative cursor:pointer ancestor as a delegate when the control itself is clickable", () => {
    // A card wrapping a real, directly-clickable button — the button is not pointer-events:none, so the
    // delegate search must never even be consulted for it.
    document.body.innerHTML = `
      <div class="card" style="cursor: pointer;">
        <button id="real-btn" type="button">Real Button</button>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.tag === "button");

    expect(button?.click_delegate).toBeUndefined();
    expect(button?.locator?.strategy).toBe("role_name");
  });
});

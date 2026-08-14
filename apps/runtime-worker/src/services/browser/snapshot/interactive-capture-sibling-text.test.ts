/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the `sibling_text` tier (T7b): a last-resort locator for a control with no
 * accessible name from any source (no aria-label, no <label>, no own text, no testid) but exactly one
 * non-interactive sibling carrying unique text — e.g. an app's custom checkbox list with a floating
 * <span> label never wired up via aria-labelledby (see this session's "Add Event" form investigation).
 *
 * happy-dom does not implement `document.evaluate` (XPath), so `countByXpath` always returns -1 here
 * and every XPath-verified tier (attr_combo/dom_id/sibling_text alike — see
 * interactive-capture-shadow-dom.test.ts for the same documented limitation) can never be confirmed
 * unique in this environment; capture correctly degrades to the always-available `nth` tier instead.
 * These tests lock in that degraded-but-safe behavior; the tier's real firing is verified against a
 * real Chromium instance (see this session's manual verification), not here.
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

describe("captureInteractiveSnapshot — sibling_text fallback", () => {
  it("does not crash and does not fabricate a name-based locator for a nameless control with one text sibling", () => {
    document.body.innerHTML = `
      <div class="event-type-row">
        <input type="checkbox">
        <span>GAY EVENT</span>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.tag === "input");

    expect(checkbox).toBeDefined();
    expect(checkbox?.name).toBe("");
    // No accessible name exists anywhere, so a role_name/label/placeholder/text locator would be a
    // fabrication — must not appear regardless of environment.
    expect(checkbox?.locator?.strategy).not.toBe("role_name");
    expect(checkbox?.locator?.strategy).not.toBe("label");
    expect(checkbox?.locator?.strategy).not.toBe("text");
    // Environment can't verify XPath uniqueness (see file header) — degrades to nth rather than
    // silently producing nothing or a wrong tier.
    expect(checkbox?.locator?.strategy).toBe("nth");
  });

  it("leaves a normally-labelled control on its usual tier (unaffected by the new fallback)", () => {
    document.body.innerHTML = `
      <div>
        <input type="checkbox" aria-label="Marketing emails">
        <span>Unrelated helper text</span>
      </div>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const checkbox = result.elements.find((e) => e.tag === "input");

    expect(checkbox?.name).toBe("Marketing emails");
    // A checkbox is a name-from-content-eligible role with an author name (aria-label), so T4 (role_name)
    // wins ahead of T5 (label) — the fallback tier never even gets a chance to run.
    expect(checkbox?.locator?.strategy).toBe("role_name");
  });
});

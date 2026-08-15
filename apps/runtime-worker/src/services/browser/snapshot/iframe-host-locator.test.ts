/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import { deriveIframeHostLocator } from "./iframe-host-locator.evaluate.js";

const OPTS = { testidCandidates: ["data-testid"], projectTestidAttr: "data-testid" };

describe("deriveIframeHostLocator", () => {
  it("prefers the project testid attribute", () => {
    document.body.innerHTML = '<iframe data-testid="checkout-frame"></iframe>';
    const el = document.querySelector("iframe")!;
    expect(deriveIframeHostLocator(el, OPTS)).toEqual({
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "checkout-frame"
    });
  });

  // Note: T2 (testid_xpath) / T3 (dom_id) / T6 (attr_combo) are all XPath-verified — happy-dom has no
  // `document.evaluate`, so `countByXpath` always returns -1 here and every one of these tiers correctly
  // (if unhelpfully, for this test) degrades to "nth", same documented gap as the rest of this codebase's
  // happy-dom suite (see interactive-capture-shadow-dom.test.ts). The real behavior for these three tiers
  // is verified against real Chromium — confirmed empirically against the actual Klarna checkout iframe
  // (id="klarna-checkout-iframe" → dom_id) — and pinned by the real-Chromium integration test.
  it("degrades T2/T3/T6 to nth under happy-dom's XPath gap (real behavior verified via real Chromium)", () => {
    document.body.innerHTML =
      '<iframe id="klarna-checkout-iframe" name="express-checkout"></iframe>';
    const el = document.querySelector("iframe")!;
    expect(deriveIframeHostLocator(el, OPTS)).toMatchObject({ strategy: "nth", confidence: "low" });
  });

  it("falls all the way to positional nth when nothing else identifies the iframe", () => {
    document.body.innerHTML = "<div><iframe></iframe><iframe></iframe></div>";
    const [first, second] = Array.from(document.querySelectorAll("iframe"));
    expect(deriveIframeHostLocator(first!, OPTS)).toMatchObject({
      strategy: "nth",
      confidence: "low"
    });
    const secondLoc = deriveIframeHostLocator(second!, OPTS);
    expect(secondLoc.strategy).toBe("nth");
    // Different positions must produce different xpaths, or two distinct iframes would collide.
    expect(secondLoc.xpath).not.toBe(deriveIframeHostLocator(first!, OPTS).xpath);
  });

  it("never returns undefined for an attached element (nth is the guaranteed last resort)", () => {
    document.body.innerHTML = "<iframe></iframe>";
    const el = document.querySelector("iframe")!;
    expect(deriveIframeHostLocator(el, OPTS)).toBeDefined();
  });

  // T6's countByXpath is itself XPath-gated (the happy-dom gap noted above applies here too, so this
  // can't positively assert "T6 fires"), but it MUST NOT crash or hang on a generated-looking name —
  // this is a regression guard for the guard itself. The actual accept/reject behavior (generated name
  // rejected → falls through; stable name accepted → attr_combo) is verified against real Chromium:
  // confirmed both ways with a `__privateStripeFrame47514`-shaped name (rejected, falls to nth) and an
  // `express-checkout-form`-shaped name (accepted, attr_combo) — matching the real Stripe iframe names
  // seen in production capture (`__privateStripeFrame47514`, `__privateStripeController1571`, …) that
  // motivated this guard: trusting them produced a locator that resolved at capture but timed out at
  // act once the SDK remounted the iframe under a new generated name.
  it("does not crash on a generated-looking iframe name (Stripe's __privateStripeFrame47514 shape)", () => {
    document.body.innerHTML = '<iframe name="__privateStripeFrame47514"></iframe>';
    const el = document.querySelector("iframe")!;
    expect(deriveIframeHostLocator(el, OPTS)).toBeDefined();
  });
});

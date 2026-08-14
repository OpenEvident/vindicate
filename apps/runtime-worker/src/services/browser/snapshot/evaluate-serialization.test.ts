/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureInteractiveSnapshot } from "./interactive-capture.evaluate.js";

function serializedBody(fn: (...args: never[]) => unknown): string {
  return fn.toString();
}

describe("page.evaluate serialization", () => {
  it("captureInteractiveSnapshot embeds helpers in its serialized body", () => {
    const body = serializedBody(captureInteractiveSnapshot);
    expect(body).toContain("__VINDICATE_EVAL__:interactive_snapshot__");
    expect(body).toContain("function isInteractive(");
    expect(body).toContain("function digestRef(");
    expect(body).toContain("function stableRefFor(");
    expect(body).toContain("function getNearestLandmark(");
    expect(body).toContain("function captureAlerts(");
    expect(body).toContain("function captureVerifiable(");
  });

  it("digestRef does not use crypto.subtle (works on plain HTTP)", () => {
    const body = serializedBody(captureInteractiveSnapshot);
    expect(body).not.toContain("crypto.subtle");
    expect(body).toContain("2166136261");
    expect(body).toContain("16777619");
  });

  it("captureInteractiveSnapshot surfaces ARIA attributes on elements", () => {
    document.body.innerHTML = `<button data-testid="aria-btn" aria-busy="true" aria-checked="mixed">X</button>`;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    const btn = result.elements.find((e) => e.testid === "aria-btn");
    expect(btn?.aria_busy).toBe(true);
    expect(btn?.aria_checked).toBe("mixed");
  });

  it("captureInteractiveSnapshot runs in a browser context", () => {
    document.body.innerHTML = `
      <button data-testid="submit-btn" aria-label="Submit">Go</button>
      <input type="text" placeholder="Name" />
    `;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    expect(result.error).toBeUndefined();
    expect(result.elements.length).toBeGreaterThanOrEqual(2);
    expect(result.elements.some((e) => e.testid === "submit-btn")).toBe(true);
    expect(result.alerts).toEqual([]);
  });

  it("captureInteractiveSnapshot captures alert live regions", () => {
    document.body.innerHTML = `
      <div role="status">Loading complete</div>
      <button data-testid="go">Go</button>
    `;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    expect(result.alerts).toContain("Loading complete");
  });

  it("captureInteractiveSnapshot assigns landmark context to elements", () => {
    document.body.innerHTML = `
      <nav aria-label="Main">
        <button data-testid="nav-btn">Home</button>
      </nav>
    `;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    const btn = result.elements.find((e) => e.testid === "nav-btn");
    expect(btn?.context).toBe("nav 'Main'");
  });

  it("captureInteractiveSnapshot captures non-interactive elements with testid", () => {
    document.body.innerHTML = `<span e2e="price">$99</span>`;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["e2e"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    expect(result.elements.some((e) => e.testid === "price")).toBe(true);
  });

  function capture(testidCandidates: string[]) {
    return captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates,
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
  }

  it("derives a testid locator on the project attribute (getByTestId tier)", () => {
    document.body.innerHTML = `<button data-testid="save">Save</button>`;
    const el = capture(["data-testid"]).elements.find((e) => e.testid === "save");
    expect(el?.locator).toMatchObject({
      strategy: "testid",
      confidence: "high",
      attr: "data-testid",
      value: "save"
    });
  });

  it("carries a structured locator on every captured element", () => {
    document.body.innerHTML = `<button data-testid="a">A</button><a href="#">Link</a>`;
    const result = capture(["data-testid"]);
    expect(result.elements.length).toBeGreaterThan(0);
    for (const e of result.elements) {
      expect(e.locator).toBeDefined();
      expect(e.locator?.strategy).toBeTruthy();
    }
  });

  it("uses the full (untruncated) accessible name for role_name, not the truncated display name", () => {
    const long = "Click here to do the thing ".repeat(6).trim(); // > 80 chars
    document.body.innerHTML = `<button>${long}</button>`;
    const el = capture(["data-testid"]).elements[0];
    expect(el?.locator?.strategy).toBe("role_name");
    expect(el?.locator?.name).toBe(long); // locator-grade name is full
    expect((el?.name.length ?? 0)).toBeLessThan(long.length); // display name is truncated
  });

  it("falls back to a low-confidence positional locator when nothing unique exists", () => {
    document.body.innerHTML = `<div onclick="noop()" tabindex="0"></div>`;
    const el = capture(["data-testid"]).elements[0];
    expect(el?.locator?.strategy).toBe("nth");
    expect(el?.locator?.confidence).toBe("low");
  });

  it("captureInteractiveSnapshot includes h1 when includeVerifiable is true", () => {
    document.body.innerHTML = `<h1>Welcome</h1><button data-testid="go">Go</button>`;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: true
    });
    expect(result.elements.some((e) => e.tag === "h1" && e.name === "Welcome")).toBe(true);
  });

  it("captureInteractiveSnapshot also includes h2-h6 when includeVerifiable is true — a dialog title is routinely an h2, not the page's one h1", () => {
    document.body.innerHTML = `<div role="dialog"><h2>Your Cart</h2></div>`;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: true
    });
    const heading = result.elements.find((e) => e.tag === "h2" && e.name === "Your Cart");
    expect(heading).toBeDefined();
    // Confirmed live gap: implicitRole had no h1-h6 case, so every captured heading (including the
    // pre-existing h1-only path) displayed role "generic" instead of "heading" — cosmetic, but real:
    // it also meant a heading's role_name locator strategy never got credit for being a heading.
    expect(heading?.role).toBe("heading");
    expect(heading?.locator).toMatchObject({ strategy: "role_name", role: "heading", name: "Your Cart" });
  });

  it("does not capture headings when includeVerifiable is false", () => {
    document.body.innerHTML = `<h1>Welcome</h1><h3>Sub</h3><button data-testid="go">Go</button>`;
    const result = captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates: ["data-testid"],
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
    expect(result.elements.some((e) => e.tag === "h1" || e.tag === "h3")).toBe(false);
  });

  describe("aria-haspopup marks a div-based popup trigger as interactive", () => {
    it("captures a plain <div> with aria-haspopup even without role or tabindex (Radix asChild trigger)", () => {
      // No testid, role, onclick, or tabindex — the div's only interactivity signal is aria-haspopup,
      // matching the real Radix DropdownMenuTrigger markup found on GrubCenter's product page.
      document.body.innerHTML = `
        <div aria-haspopup="menu" aria-expanded="false" data-state="closed">Create New</div>
      `;
      const el = capture(["data-cy"]).elements.find((e) => e.name === "Create New");
      expect(el).toBeDefined();
    });

    it("recognizes every valid non-false aria-haspopup token (true/menu/listbox/tree/grid/dialog)", () => {
      for (const token of ["true", "menu", "listbox", "tree", "grid", "dialog"]) {
        document.body.innerHTML = `<div aria-haspopup="${token}" data-cy="trigger">X</div>`;
        const el = capture(["data-cy"]).elements.find((e) => e.testid === "trigger");
        expect(el, `token "${token}" should be interactive`).toBeDefined();
      }
    });

    it("does not treat aria-haspopup=\"false\" or a garbage value as interactive", () => {
      // No testid/role/onclick/tabindex on either div, so inclusion depends solely on isInteractive —
      // these must stay uncaptured, unlike the valid-token cases above.
      document.body.innerHTML = `
        <div aria-haspopup="false">A</div>
        <div aria-haspopup="nonsense">B</div>
      `;
      const result = capture(["data-cy"]);
      expect(result.elements.some((e) => e.name === "A")).toBe(false);
      expect(result.elements.some((e) => e.name === "B")).toBe(false);
    });

    it("does not derive a dom_id locator off Radix's auto-generated id (radix-:xyz:)", () => {
      // Live-confirmed on GrubCenter: the real trigger has id="radix-:ria:" — render-order-dependent,
      // not a stable locator, but the old GENERATED_ID_RE never matched the "prefix-:token:" shape.
      document.body.innerHTML = `<div id="radix-:ria:" aria-haspopup="menu">Create New</div>`;
      const el = capture(["data-cy"]).elements.find((e) => e.name === "Create New");
      expect(el?.dom_id).toBeUndefined();
      expect(el?.locator?.strategy).not.toBe("dom_id");
    });
  });

  describe("scoped plain-text capture (the cart-drawer Subtotal/Total case)", () => {
    it("does not surface plain non-interactive text on an unscoped read", () => {
      document.body.innerHTML = `
        <div id="cart">
          <span>Subtotal</span>
          <span>SEK 700</span>
          <button data-testid="close">Close</button>
        </div>
      `;
      const result = captureInteractiveSnapshot({
        maxNodes: 50,
        testidCandidates: ["data-testid"],
        collapse: false,
        viewportOnly: false,
        includeVerifiable: true
      });
      expect(result.elements.some((e) => e.name === "Subtotal")).toBe(false);
      expect(result.elements.some((e) => e.name === "SEK 700")).toBe(false);
    });

    it("surfaces plain non-interactive text once the read is scoped into its container — confirmed live gap (kustom.co cart drawer)", () => {
      document.body.innerHTML = `
        <div id="cart">
          <span>Arigato Tag Cap</span>
          <div><span>Subtotal</span><span>SEK 700</span></div>
          <div><span>Total</span><span>SEK 700</span></div>
          <button data-testid="close">Close</button>
        </div>
      `;
      const result = captureInteractiveSnapshot({
        maxNodes: 50,
        testidCandidates: ["data-testid"],
        collapse: false,
        viewportOnly: false,
        includeVerifiable: true,
        scopeCss: "#cart"
      });
      expect(result.elements.some((e) => e.name === "Arigato Tag Cap")).toBe(true);
      expect(result.elements.some((e) => e.name === "Subtotal")).toBe(true);
      // "SEK 700" appears twice (line price and Subtotal both show it) — each occurrence is still
      // ambiguous within the scope on text alone, so neither is captured; "Total"/its own "SEK 700" line
      // is only unique if the two "SEK 700"s exist, which is deliberate here to prove the uniqueness gate.
      expect(result.elements.some((e) => e.name === "SEK 700")).toBe(false);
    });

    it("does not capture text whose exact value is not unique within the scope (avoids a two-element getByText match)", () => {
      document.body.innerHTML = `
        <div id="cart">
          <span>SEK 700</span>
          <span>SEK 700</span>
        </div>
      `;
      const result = captureInteractiveSnapshot({
        maxNodes: 50,
        testidCandidates: ["data-testid"],
        collapse: false,
        viewportOnly: false,
        includeVerifiable: true,
        scopeCss: "#cart"
      });
      expect(result.elements.some((e) => e.name === "SEK 700")).toBe(false);
    });

    it("derives a working 'text' strategy locator for the newly-captured plain text", () => {
      document.body.innerHTML = `<div id="cart"><span>Subtotal</span></div>`;
      const result = captureInteractiveSnapshot({
        maxNodes: 50,
        testidCandidates: ["data-testid"],
        collapse: false,
        viewportOnly: false,
        includeVerifiable: true,
        scopeCss: "#cart"
      });
      const el = result.elements.find((e) => e.name === "Subtotal");
      expect(el?.locator).toMatchObject({ strategy: "text", confidence: "high", value: "Subtotal" });
    });

    it("does not capture a wrapping non-leaf ancestor, only the actual text-bearing leaf", () => {
      document.body.innerHTML = `<div id="cart"><div><span>Total</span></div></div>`;
      const result = captureInteractiveSnapshot({
        maxNodes: 50,
        testidCandidates: ["data-testid"],
        collapse: false,
        viewportOnly: false,
        includeVerifiable: true,
        scopeCss: "#cart"
      });
      const matches = result.elements.filter((e) => e.name === "Total");
      expect(matches.length).toBe(1);
      expect(matches[0]?.tag).toBe("span");
    });
  });
});

// happy-dom has no real XPath engine, so stub document.evaluate to exercise the XPath-backed tiers
// (dom_id / testid_xpath / attr_combo). The stub also lets us assert the exact XPath string built.
describe("structured locator — XPath tiers", () => {
  let evalSpy: ReturnType<typeof vi.fn>;
  let originalEvaluate: unknown;
  let originalXPathResult: unknown;

  beforeEach(() => {
    evalSpy = vi.fn(() => ({ snapshotLength: 1 }));
    originalEvaluate = (document as unknown as Record<string, unknown>).evaluate;
    originalXPathResult = (globalThis as unknown as Record<string, unknown>).XPathResult;
    (document as unknown as Record<string, unknown>).evaluate = evalSpy;
    (globalThis as unknown as Record<string, unknown>).XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 };
  });

  afterEach(() => {
    (document as unknown as Record<string, unknown>).evaluate = originalEvaluate;
    (globalThis as unknown as Record<string, unknown>).XPathResult = originalXPathResult;
  });

  function capture(testidCandidates: string[]) {
    return captureInteractiveSnapshot({
      maxNodes: 50,
      testidCandidates,
      collapse: false,
      viewportOnly: false,
      includeVerifiable: false
    });
  }

  it("derives dom_id with a well-formed XPath for a stable id", () => {
    document.body.innerHTML = `<button id="save">Save</button>`;
    const el = capture(["data-testid"]).elements[0];
    expect(el?.locator?.strategy).toBe("dom_id");
    expect(el?.locator?.xpath).toBe('//*[@id="save"]');
    expect(evalSpy).toHaveBeenCalledWith('//*[@id="save"]', document, null, 7, null);
  });

  it("derives testid_xpath for a non-project test-id attribute", () => {
    document.body.innerHTML = `<button data-cy="run">Run</button>`;
    const el = capture(["data-testid", "data-cy"]).elements.find((e) => e.testid === "run");
    expect(el?.locator?.strategy).toBe("testid_xpath");
    expect(el?.locator?.xpath).toBe('//*[@data-cy="run"]');
  });

  it("derives attr_combo for a role-less-named input with stable attributes", () => {
    document.body.innerHTML = `<input type="email" name="email" />`;
    const el = capture(["data-testid"]).elements[0];
    expect(el?.locator?.strategy).toBe("attr_combo");
    expect(el?.locator?.xpath).toBe('//input[@type="email" and @name="email"]');
  });

  it("falls through to the next tier when the XPath is not unique", () => {
    evalSpy.mockReturnValue({ snapshotLength: 2 });
    document.body.innerHTML = `<input type="email" name="email" />`;
    const el = capture(["data-testid"]).elements[0];
    expect(el?.locator?.strategy).toBe("nth");
    expect(el?.locator?.confidence).toBe("low");
  });
});

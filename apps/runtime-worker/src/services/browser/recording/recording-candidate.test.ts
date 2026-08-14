/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import {
  buildScopedCandidate,
  buildSiblingTextCandidate,
  chooseBestSelectorCandidate,
  isGeneratedDomId
} from "./recording-candidate.js";

describe("isGeneratedDomId", () => {
  it("detects hash and numeric ids", () => {
    expect(isGeneratedDomId("input-3a7f9c")).toBe(true);
    expect(isGeneratedDomId("42")).toBe(true);
    // Real React useId() output is colon-wrapped on both ends (":r0:"), not just leading (":r0") — the
    // old pattern only matched the latter, which never actually occurs in the DOM.
    expect(isGeneratedDomId(":r0:")).toBe(true);
    // Library-prefixed variant: Radix sets identifierPrefix "radix-", confirmed live on
    // GrubCenter's dropdown-menu trigger ("radix-:ria:") — this used to slip through as "stable".
    expect(isGeneratedDomId("radix-:ria:")).toBe(true);
    expect(isGeneratedDomId("email")).toBe(false);
  });
});

describe("chooseBestSelectorCandidate", () => {
  it("prefers scoped over role_name", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "role_name", value: 'button[name="Delete"]' },
        {
          strategy: "scoped",
          value: 'button[name="Delete"]',
          container: { role: "row", name: "Product ABC" }
        }
      ])
    ).toMatchObject({ strategy: "scoped" });
  });

  it("skips a dynamic candidate when a stable alternative exists", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "nth", value: "//div[3]", dynamic: true, strength: "weak" },
        { strategy: "role_name", value: 'input[name="Email"]', strength: "strong" }
      ])
    ).toMatchObject({ strategy: "role_name" });
  });
});

describe("buildScopedCandidate", () => {
  it("builds a scoped candidate for a row control", () => {
    document.body.innerHTML =
      '<table><tr><td>Product ABC</td><td><button type="button">Delete</button></td></tr></table>';
    const btn = document.querySelector("button")!;
    const candidate = buildScopedCandidate(btn, (el) => el.textContent?.trim() ?? "");
    // The container's ARIA implicit role, not its tag name: getByRole('tr', ...) matches nothing in a
    // real browser (Playwright resolves against the computed accessibility tree, where <tr>'s implicit
    // role is "row") — a real, pre-existing bug this now fixes (regression test right below).
    expect(candidate).toMatchObject({
      strategy: "scoped",
      value: 'button[name="Delete"]',
      container: { role: "row" }
    });
  });

  it("uses the ARIA implicit role, never the raw tag name, for both container and target", () => {
    document.body.innerHTML =
      '<ul><li>Item text<button type="button">Remove</button></li></ul>';
    const btn = document.querySelector("button")!;
    const candidate = buildScopedCandidate(btn, (el) => el.textContent?.trim() ?? "");
    expect(candidate?.container?.role).toBe("listitem");
    expect(candidate?.container?.role).not.toBe("li");
  });

  it("keeps an explicit role attribute over the implicit mapping", () => {
    document.body.innerHTML =
      '<div role="row"><div role="cell">Product ABC</div><button type="button">Delete</button></div>';
    const btn = document.querySelector("button")!;
    const candidate = buildScopedCandidate(btn, (el) => el.textContent?.trim() ?? "");
    expect(candidate?.container?.role).toBe("row");
  });
});

describe("buildSiblingTextCandidate", () => {
  const accessibleName = (el: Element) => el.textContent?.trim() ?? "";
  const isInteractive = (el: Element) => ["button", "a", "input", "select", "textarea"].includes(el.tagName.toLowerCase());

  it("builds a verified-shape xpath candidate when exactly one non-interactive sibling carries text", () => {
    document.body.innerHTML = '<div><input type="checkbox"><span>GAY EVENT</span></div>';
    const checkbox = document.querySelector("input")!;
    const candidate = buildSiblingTextCandidate(checkbox, accessibleName, isInteractive);
    expect(candidate).toEqual({
      strategy: "sibling_text",
      value: '//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]',
      strength: "medium"
    });
  });

  it("returns null when there is no text-bearing sibling", () => {
    document.body.innerHTML = '<div><input type="checkbox"><span></span></div>';
    const checkbox = document.querySelector("input")!;
    expect(buildSiblingTextCandidate(checkbox, accessibleName, isInteractive)).toBeNull();
  });

  it("returns null when more than one sibling carries text (ambiguous)", () => {
    document.body.innerHTML = '<div><input type="checkbox"><span>Label A</span><span>Label B</span></div>';
    const checkbox = document.querySelector("input")!;
    expect(buildSiblingTextCandidate(checkbox, accessibleName, isInteractive)).toBeNull();
  });

  it("ignores interactive siblings when counting text sources", () => {
    document.body.innerHTML = '<div><input type="checkbox"><button>Not a label</button><span>Real Label</span></div>';
    const checkbox = document.querySelector("input")!;
    const candidate = buildSiblingTextCandidate(checkbox, accessibleName, isInteractive);
    expect(candidate?.value).toContain("Real Label");
  });

  it("returns null when the element has no parent", () => {
    const orphan = document.createElement("input");
    expect(buildSiblingTextCandidate(orphan, accessibleName, isInteractive)).toBeNull();
  });

  it("escapes a double-quote in the matched text with a single-quoted xpath literal", () => {
    document.body.innerHTML = '<div><input type="checkbox"><span>Say "Hi"</span></div>';
    const checkbox = document.querySelector("input")!;
    const candidate = buildSiblingTextCandidate(checkbox, accessibleName, isInteractive);
    expect(candidate?.value).toContain(`'Say "Hi"'`);
  });
});

describe("chooseBestSelectorCandidate — sibling_text ordering", () => {
  it("prefers attr_combo over sibling_text", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "sibling_text", value: "//input[…]" },
        { strategy: "attr_combo", value: '//input[@type="checkbox"]' }
      ])
    ).toMatchObject({ strategy: "attr_combo" });
  });

  it("prefers sibling_text over nth (last resort)", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "nth", value: "(//input)[3]" },
        { strategy: "sibling_text", value: "//input[…]" }
      ])
    ).toMatchObject({ strategy: "sibling_text" });
  });
});

describe("chooseBestSelectorCandidate — text ordering", () => {
  it("prefers role_name over text", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "text", value: "GAY EVENT" },
        { strategy: "role_name", value: 'button[name="Save"]' }
      ])
    ).toMatchObject({ strategy: "role_name" });
  });

  it("prefers text over attr_combo and sibling_text", () => {
    expect(
      chooseBestSelectorCandidate([
        { strategy: "attr_combo", value: '//div[@type="x"]' },
        { strategy: "sibling_text", value: "//div[…]" },
        { strategy: "text", value: "GAY EVENT" }
      ])
    ).toMatchObject({ strategy: "text" });
  });
});

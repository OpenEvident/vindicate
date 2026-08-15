/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the incomplete-sanitization fix: getAccessibleName/hasAuthorName used to
 * build `label[for="${id.replace(/"/g, '\\"')}"]` selectors by hand, which only escapes a literal
 * quote — a pre-existing backslash in the id is left untouched. For an id containing a backslash
 * (e.g. `abc\def`), the resulting selector `[for="abc\def"]` is CSS that treats `\d` as an escape
 * sequence rather than a literal backslash-then-d, so the selector silently fails to match the
 * intended element (confirmed empirically: 0 matches) instead of throwing — a silent mislabeling
 * bug, not just a crash. The fix reuses this file's own escapeAttrValue() helper, which doubles a
 * literal backslash before escaping quotes, so the selector round-trips the value correctly.
 *
 * (A backslash immediately followed by a quote is a separate, more esoteric case that happy-dom's
 * CSS engine can't parse either way — confirmed both the old and new escaping throw there
 * regardless of correctness — so that combination isn't verifiable in this environment.)
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

// A literal backslash in the middle of the value — the old escaping left this untouched, which
// happy-dom's CSS engine (like real browsers) parses as an escape sequence rather than a literal
// backslash, silently breaking the match.
const BACKSLASH_ID = "abc\\def";

describe("captureInteractiveSnapshot — label lookup with a backslash in the id", () => {
  it("finds the associated <label> instead of silently failing to match", () => {
    document.body.innerHTML = "";
    const label = document.createElement("label");
    label.setAttribute("for", BACKSLASH_ID);
    label.textContent = "My Label";
    const input = document.createElement("input");
    input.type = "text";
    input.id = BACKSLASH_ID;
    document.body.appendChild(label);
    document.body.appendChild(input);

    const result = captureInteractiveSnapshot(baseOpts);
    const found = result.elements.find((e) => e.tag === "input");
    expect(found?.name).toBe("My Label");
  });

  it("scopes correctly to a testid containing the same backslash", () => {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    container.setAttribute("data-testid", BACKSLASH_ID);
    const button = document.createElement("button");
    button.textContent = "Click me";
    container.appendChild(button);
    document.body.appendChild(container);

    const opts = {
      ...baseOpts,
      scopeDescriptor: { testid: BACKSLASH_ID, testidAttr: "data-testid", tag: "div" }
    };

    const result = captureInteractiveSnapshot(opts);
    expect(result.elements.some((e) => e.name === "Click me")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { computeStableRef, digestStableRefInput, isGeneratedDomId } from "./ref-generator.js";

describe("ref-generator", () => {
  it("flags generated DOM ids", () => {
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

  it("is stable for tiered inputs", () => {
    const a = computeStableRef({
      tag: "button",
      testidValue: "submit",
      role: "button",
      name: "",
      domPath: "html>body>button:nth-of-type(1)"
    });
    const b = computeStableRef({
      tag: "button",
      testidValue: "submit",
      role: "button",
      name: "ignored when testid",
      domPath: "other"
    });
    expect(a).toBe(b);
    expect(a.startsWith("ref-")).toBe(true);
  });

  it("digestStableRefInput uses FNV-1a (8 hex chars)", () => {
    expect(digestStableRefInput("x")).toBe("ref-fd0c5087");
  });
});

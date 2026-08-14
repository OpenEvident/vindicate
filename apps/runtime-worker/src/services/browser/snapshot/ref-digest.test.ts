import { describe, expect, it } from "vitest";

import { digestStableRefInput } from "./ref-digest.js";
import { computeStableRef } from "./ref-generator.js";

describe("ref-digest", () => {
  it("produces ref- prefixed 8 hex chars", () => {
    expect(digestStableRefInput("x")).toMatch(/^ref-[0-9a-f]{8}$/);
  });

  it("matches computeStableRef tier-1 input", () => {
    const input = { tag: "button", testidValue: "submit", role: "button", name: "", domPath: "x" };
    expect(computeStableRef(input)).toBe(digestStableRefInput("buttonsubmit"));
  });
});

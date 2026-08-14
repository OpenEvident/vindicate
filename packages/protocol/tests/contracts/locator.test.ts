import { describe, expect, it } from "vitest";

import { resolveRoleChain, type StructuredLocator } from "../../src/runtime/locator.js";

const loc = (over: Partial<StructuredLocator>): StructuredLocator => ({
  strategy: "role_name",
  confidence: "high",
  ...over
});

describe("resolveRoleChain", () => {
  it("role_name with a name → one step that binds the name (exact)", () => {
    expect(resolveRoleChain(loc({ role: "button", name: "Save" }))).toEqual([
      { role: "button", name: "Save", exact: true }
    ]);
  });

  it("role_name without a name → role-only step (no name bound)", () => {
    // The name-prohibited case (alert/status): never produce { name: "" }.
    expect(resolveRoleChain(loc({ role: "alert" }))).toEqual([{ role: "alert", exact: true }]);
  });

  it("empty name is treated as no name", () => {
    expect(resolveRoleChain(loc({ role: "alert", name: "" }))).toEqual([
      { role: "alert", exact: true }
    ]);
  });

  it("scoped → container (non-exact) then target (exact)", () => {
    const chain = resolveRoleChain(
      loc({ strategy: "scoped", role: "button", name: "Edit", container: { role: "row", name: "Widget X" } })
    );
    expect(chain).toEqual([
      { role: "row", name: "Widget X", exact: false },
      { role: "button", name: "Edit", exact: true }
    ]);
  });

  it("returns undefined for non-role strategies", () => {
    expect(resolveRoleChain(loc({ strategy: "testid", attr: "data-testid", value: "x" }))).toBeUndefined();
    expect(resolveRoleChain(loc({ strategy: "role_name", role: undefined }))).toBeUndefined();
  });

  it("sibling_text is a non-role strategy — never fed into getByRole name matching", () => {
    expect(
      resolveRoleChain(loc({ strategy: "sibling_text", value: "Delete", xpath: "//button[preceding-sibling::*[normalize-space()=\"Delete\"]]" }))
    ).toBeUndefined();
  });
});

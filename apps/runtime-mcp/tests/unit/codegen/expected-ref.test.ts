import { describe, expect, it } from "vitest";

import {
  duplicateExpectedStringValues,
  expectedKeysForStringValue,
  hasExpectedData
} from "../../../src/codegen/expected-ref.js";

describe("expected-ref", () => {
  it("hasExpectedData is false for undefined and empty object", () => {
    expect(hasExpectedData(undefined)).toBe(false);
    expect(hasExpectedData({})).toBe(false);
    expect(hasExpectedData({ key: "value" })).toBe(true);
  });

  it("expectedKeysForStringValue returns all matching keys", () => {
    expect(
      expectedKeysForStringValue(
        { a: "same", b: "other", c: "same" },
        "same"
      )
    ).toEqual(["a", "c"]);
  });

  it("duplicateExpectedStringValues finds colliding values", () => {
    const dupes = duplicateExpectedStringValues({ x: "dup", y: "dup", z: "unique" });
    expect(dupes.get("dup")).toEqual(["x", "y"]);
    expect(dupes.has("unique")).toBe(false);
  });
});

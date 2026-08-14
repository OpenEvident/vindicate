import { describe, expect, it } from "vitest";

import {
  appendUniqueNames,
  removeName,
  reorderItems
} from "../../../src/webview/components/recording/new-recording/precondition-utils";

describe("precondition-utils", () => {
  it("reorderItems moves an entry to a new index", () => {
    expect(reorderItems(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderItems(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("appendUniqueNames preserves order and skips duplicates", () => {
    expect(appendUniqueNames(["Login"], ["Checkout", "Login", "Profile"])).toEqual([
      "Login",
      "Checkout",
      "Profile"
    ]);
  });

  it("removeName removes a single entry", () => {
    expect(removeName(["Login", "Checkout"], "Login")).toEqual(["Checkout"]);
  });
});

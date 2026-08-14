import { describe, expect, it } from "vitest";

import { resolveVindicatePath, toVindicateRelativePath } from "../../src/runtime/recording-path.js";

describe("recording path helpers", () => {
  it("strips absolute prefix to .vindicate-relative path", () => {
    expect(
      toVindicateRelativePath("e:\\testing-mcp\\testing-v3-2\\.vindicate\\recordings\\login.json")
    ).toBe(".vindicate/recordings/login.json");
  });

  it("passes through already-relative paths", () => {
    expect(toVindicateRelativePath(".vindicate/recordings/login.json")).toBe(
      ".vindicate/recordings/login.json"
    );
  });

  it("resolves .vindicate-relative paths against project root", () => {
    expect(resolveVindicatePath("e:/proj", ".vindicate/recordings/login.json")).toBe(
      "e:/proj/.vindicate/recordings/login.json"
    );
  });
});

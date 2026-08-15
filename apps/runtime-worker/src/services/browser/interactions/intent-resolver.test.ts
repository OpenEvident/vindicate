import { describe, expect, it } from "vitest";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import { resolveByTarget } from "./intent-resolver.js";

function desc(
  overrides: Partial<ElementDescriptor> & Pick<ElementDescriptor, "role" | "name">
): ElementDescriptor {
  return {
    testidAttr: "data-testid",
    tag: "button",
    snapshotUrl: "https://app.test/",
    ...overrides
  };
}

describe("resolveByTarget", () => {
  it("returns not_found when no descriptors match", () => {
    const map = new Map<string, ElementDescriptor>([
      ["ref-00000001", desc({ role: "button", name: "Cancel" })]
    ]);
    expect(resolveByTarget("Save product", map)).toEqual({ type: "not_found" });
  });

  it("returns found for a clear single winner", () => {
    const save = desc({ role: "button", name: "Save", testid: "save-btn" });
    const map = new Map<string, ElementDescriptor>([
      ["ref-00000001", desc({ role: "button", name: "Cancel" })],
      ["ref-00000002", save]
    ]);
    const result = resolveByTarget("Save", map);
    expect(result).toEqual({ type: "found", ref: "ref-00000002", descriptor: save });
  });

  it("returns ambiguous when top scores are too close", () => {
    const map = new Map<string, ElementDescriptor>([
      ["ref-00000001", desc({ role: "button", name: "Save", context: "dialog 'Edit'" })],
      ["ref-00000002", desc({ role: "button", name: "Save", context: "footer" })]
    ]);
    const result = resolveByTarget("Save button", map);
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates.length).toBe(2);
      expect(result.candidates.every((c) => c.name === "Save")).toBe(true);
    }
  });

  it("includes context on ambiguous candidates when present", () => {
    const map = new Map<string, ElementDescriptor>([
      ["ref-00000001", desc({ role: "button", name: "Delete", context: "main" })],
      ["ref-00000002", desc({ role: "button", name: "Delete", context: "nav" })]
    ]);
    const result = resolveByTarget("Delete", map);
    if (result.type === "ambiguous") {
      const contexts = result.candidates.map((c) => c.context).sort();
      expect(contexts).toEqual(["main", "nav"]);
    }
  });
});

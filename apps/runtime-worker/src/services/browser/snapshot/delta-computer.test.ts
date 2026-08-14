import { describe, expect, it } from "vitest";

import { computeDelta, computeSupersedes } from "./delta-computer.js";

describe("delta-computer", () => {
  it("detects added, removed, and field changes", () => {
    const prev = {
      r1: { name: "A", value: "1", disabled: false },
      r2: { name: "B" }
    };
    const cur = {
      r1: { name: "A", value: "2", disabled: false },
      r3: { name: "C" }
    };
    const d = computeDelta(prev, cur);
    expect(d.added).toEqual(["r3"]);
    expect(d.removed).toEqual(["r2"]);
    expect(d.changed.length).toBe(1);
    expect(d.changed[0]?.ref).toBe("r1");
    expect(d.changed[0]?.changes.some((c) => c.field === "value")).toBe(true);
  });

  it("returns empty diff when prev map is empty (caller handles URL fallback separately)", () => {
    const d = computeDelta({}, { r1: { name: "Only" } });
    expect(d.added).toEqual(["r1"]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
  });
});

describe("computeSupersedes", () => {
  it("marks a single newly-added element as superseding a same-role+name older one", () => {
    // The actual kustom.co shape: an old "Card number" (flat) still present, a new one (nested,
    // just appeared this read after selecting the payment method) with a different frame_path/ref.
    const elements = [
      { ref: "ref-old", role: "textbox", name: "Card number" },
      { ref: "ref-new", role: "textbox", name: "Card number" }
    ];
    const result = computeSupersedes(elements, ["ref-new"]);
    expect(result.get("ref-new")).toBe("ref-old");
    expect(result.has("ref-old")).toBe(false);
  });

  it("does nothing when there is no older instance to supersede (ordinary new element)", () => {
    const elements = [{ ref: "ref-new", role: "button", name: "Save" }];
    const result = computeSupersedes(elements, ["ref-new"]);
    expect(result.size).toBe(0);
  });

  it("does nothing when nothing is newly-added (no delta context / unrelated added list)", () => {
    const elements = [
      { ref: "ref-a", role: "textbox", name: "Card number" },
      { ref: "ref-b", role: "textbox", name: "Card number" }
    ];
    const result = computeSupersedes(elements, []);
    expect(result.size).toBe(0);
  });

  it("stays conservative when more than one candidate is newly-added — does not guess which is real", () => {
    const elements = [
      { ref: "ref-old", role: "textbox", name: "Card number" },
      { ref: "ref-new-1", role: "textbox", name: "Card number" },
      { ref: "ref-new-2", role: "textbox", name: "Card number" }
    ];
    const result = computeSupersedes(elements, ["ref-new-1", "ref-new-2"]);
    expect(result.size).toBe(0);
  });

  it("ignores elements with no accessible name (too noisy a grouping key)", () => {
    const elements = [
      { ref: "ref-old", role: "generic", name: "" },
      { ref: "ref-new", role: "generic", name: "" }
    ];
    const result = computeSupersedes(elements, ["ref-new"]);
    expect(result.size).toBe(0);
  });

  it("does not cross-contaminate unrelated role+name groups", () => {
    const elements = [
      { ref: "ref-card-old", role: "textbox", name: "Card number" },
      { ref: "ref-card-new", role: "textbox", name: "Card number" },
      { ref: "ref-exp-old", role: "textbox", name: "Expiration date" },
      { ref: "ref-exp-new", role: "textbox", name: "Expiration date" }
    ];
    const result = computeSupersedes(elements, ["ref-card-new", "ref-exp-new"]);
    expect(result.get("ref-card-new")).toBe("ref-card-old");
    expect(result.get("ref-exp-new")).toBe("ref-exp-old");
  });
});

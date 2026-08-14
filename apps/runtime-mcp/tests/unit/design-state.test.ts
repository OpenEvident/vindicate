import { describe, expect, it } from "vitest";

import { diffDesign } from "../../src/harness/design-state.js";

const baseSuites = () => [
  {
    title: "Auth",
    cases: [{ title: "should sign in" }, { title: "should sign out" }]
  }
];

describe("design-state", () => {
  it("diffDesign without previous badges all cases as added", () => {
    const badges = diffDesign(undefined, baseSuites());
    expect(badges["should sign in"]).toBe("added");
    expect(badges["should sign out"]).toBe("added");
  });

  it("diffDesign marks removed cases", () => {
    const badges = diffDesign(baseSuites(), [
      {
        title: "Auth",
        cases: [{ title: "should sign in" }]
      }
    ]);
    expect(badges["should sign out"]).toBe("removed");
    expect(badges["should sign in"]).toBeUndefined();
  });

  it("diffDesign marks modified case titles at same position", () => {
    const badges = diffDesign(baseSuites(), [
      {
        title: "Auth",
        cases: [{ title: "should log in with email" }, { title: "should sign out" }]
      }
    ]);
    expect(badges["should sign in"]).toBe("removed");
    expect(badges["should log in with email"]).toBe("modified");
    expect(badges["should sign out"]).toBeUndefined();
  });

  it("diffDesign marks new suite cases as added", () => {
    const badges = diffDesign(baseSuites(), [
      ...baseSuites(),
      {
        title: "Checkout",
        cases: [{ title: "should pay" }]
      }
    ]);
    expect(badges["should pay"]).toBe("added");
  });
});

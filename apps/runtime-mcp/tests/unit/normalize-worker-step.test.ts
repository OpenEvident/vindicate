import { describe, expect, it } from "vitest";

import { normalizeWorkerStep } from "../../src/mcp/tools/normalize-worker-step.js";

describe("normalizeWorkerStep", () => {
  it("maps fill to type with value", () => {
    expect(
      normalizeWorkerStep({ action: "fill", ref: "ref-a3f9c2b1", value: "hello" })
    ).toEqual({ action: "type", ref: "ref-a3f9c2b1", value: "hello" });
  });

  it("maps text and clear to worker type fields", () => {
    expect(
      normalizeWorkerStep({ action: "type", ref: "ref-a3f9c2b1", text: "hello", clear: true })
    ).toEqual({ action: "type", ref: "ref-a3f9c2b1", value: "hello", clear_first: true });
  });

  it("maps type key to action", () => {
    expect(normalizeWorkerStep({ type: "click", ref: "ref-a3f9c2b1" })).toEqual({
      action: "click",
      ref: "ref-a3f9c2b1"
    });
  });

  it("normalises bare hex refs to ref-xxxxxxxx", () => {
    expect(normalizeWorkerStep({ action: "click", ref: "a3f9c2b1" })).toEqual({
      action: "click",
      ref: "ref-a3f9c2b1"
    });
  });
});

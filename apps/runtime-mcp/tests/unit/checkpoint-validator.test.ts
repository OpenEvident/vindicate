import { describe, expect, it } from "vitest";

import { CheckpointValidator } from "../../src/harness/checkpoint-validator.js";

describe("CheckpointValidator", () => {
  const validator = new CheckpointValidator();

  it("accepts flat scalars", () => {
    expect(validator.validate({ goal: "login", passed: true, count: 2 }).valid).toBe(true);
  });

  it("accepts empty object", () => {
    expect(validator.validate({}).valid).toBe(true);
  });

  it("accepts array values up to 50 scalar items", () => {
    const criteria = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    expect(validator.validate({ acceptance_criteria: criteria }).valid).toBe(true);
  });

  it("rejects array with more than 50 items", () => {
    const criteria = Array.from({ length: 51 }, (_, i) => `item-${i}`);
    expect(validator.validate({ acceptance_criteria: criteria }).valid).toBe(false);
  });

  it("rejects array containing non-scalar items", () => {
    expect(validator.validate({ pages: [{ id: "a" }] }).valid).toBe(false);
  });

  it("rejects nested objects except ac_coverage", () => {
    expect(validator.validate({ element: { ref: "e1" } }).valid).toBe(false);
  });

  it("accepts ac_coverage object on code-write checkpoints", () => {
    expect(
      validator.validate({
        files_written: 6,
        tests_added: 1,
        ac_coverage: { total: 1, covered: ["AC-1"], missing: [], stale: [] }
      }).valid
    ).toBe(true);
  });

  it("rejects null top-level", () => {
    expect(validator.validate(null).valid).toBe(false);
  });

  it("rejects non-object top-level string", () => {
    expect(validator.validate("done").valid).toBe(false);
  });

  it("rejects non-object top-level array", () => {
    expect(validator.validate(["a"]).valid).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { tryValidateTsExpression } from "../../../src/codegen/expression-validate.js";

describe("tryValidateTsExpression", () => {
  it("accepts quoted string literals", () => {
    expect(tryValidateTsExpression("'/'", "test.path", "test")).toBeUndefined();
    expect(
      tryValidateTsExpression("'Incorrect username or password.'", "test.path", "test")
    ).toBeUndefined();
  });

  it("accepts complete regex literals", () => {
    expect(tryValidateTsExpression("/login/", "test.path", "test")).toBeUndefined();
  });

  it("rejects unterminated regex fragments", () => {
    const err = tryValidateTsExpression("/\\/($|\\?)", "test.path", "test");
    expect(err).toBeDefined();
    expect(err?.code).toBe("invalid_assertion_arg");
  });
});

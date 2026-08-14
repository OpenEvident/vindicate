import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildActionError,
  buildMatcherError,
  zodErrorToCodegenError
} from "../../../src/codegen/validation.js";
import { ActionSchema, GenerateCodeInputSchema } from "../../../src/codegen/schema.js";
import { CodegenValidationError } from "../../../src/shared/errors.js";

describe("validation", () => {
  describe("action typo suggestion", () => {
    it("V1 — clck suggests click via Levenshtein", () => {
      const err = buildActionError("steps.0.actions.0.do", "clck");
      expect(err.fix).toContain("click");
      expect(err.validationMessage).toContain("clck");
    });

    it("V2 — cli prefix suggests click before Levenshtein", () => {
      const err = buildActionError("steps.0.actions.0.do", "cli");
      expect(err.fix).toContain("click");
    });

    it("V3 — xyz123 has no did you mean suggestion", () => {
      const err = buildActionError("steps.0.actions.0.do", "xyz123");
      expect(err.fix).not.toMatch(/did you mean/i);
    });

    it("V4 — exact match action does not produce buildActionError", () => {
      const parsed = ActionSchema.safeParse({ do: "click", ref: "submit" });
      expect(parsed.success).toBe(true);
    });
  });

  describe("matcher typo suggestion", () => {
    it("M1 — toContainTxt suggests toContainText", () => {
      const err = buildMatcherError("assertions.0.matcher", "toContainTxt");
      expect(err.fix).toContain("toContainText");
    });

    it("M2 — completely unknown matcher has no suggestion", () => {
      const err = buildMatcherError("assertions.0.matcher", "notARealMatcher");
      expect(err.fix).not.toMatch(/did you mean/i);
    });

    it("M3 — error includes field, message, and actionable fix", () => {
      const err = buildMatcherError("pages.0.verifies.0.assertions.0.matcher", "toContain");
      expect(err.field).toBe("pages.0.verifies.0.assertions.0.matcher");
      expect(err.validationMessage.length).toBeGreaterThan(0);
      expect(err.fix.length).toBeGreaterThan(10);
    });
  });

  describe("zod error conversion", () => {
    it("Z1 — missing required field sets dot-path field", () => {
      const schema = z.object({ feature: z.string().min(1) });
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(false);
      const err = zodErrorToCodegenError(parsed.error!);
      expect(err).toBeInstanceOf(CodegenValidationError);
      expect(err.field).toBe("feature");
    });

    it("Z2 — wrong type names the field in the message", () => {
      const schema = z.object({ count: z.number() });
      const parsed = schema.safeParse({ count: "nope" });
      expect(parsed.success).toBe(false);
      const err = zodErrorToCodegenError(parsed.error!);
      expect(err.field).toBe("count");
      expect(err.validationMessage.length).toBeGreaterThan(0);
    });

    it("Z3 — multiple Zod issues surface the first issue", () => {
      const parsed = GenerateCodeInputSchema.safeParse({ mode: "create" });
      expect(parsed.success).toBe(false);
      const err = zodErrorToCodegenError(parsed.error!);
      expect(err).toBeInstanceOf(CodegenValidationError);
      expect(err.field.length).toBeGreaterThan(0);
    });
  });
});

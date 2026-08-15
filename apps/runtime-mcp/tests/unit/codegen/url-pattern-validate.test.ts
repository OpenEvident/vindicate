import { describe, expect, it } from "vitest";

import {
  classifyUrlPatternAssertionArg,
  isMalformedPlaywrightUrlGlob,
  stringLiteralFromAssertionArg
} from "../../../src/codegen/url-pattern-validate.js";

describe("url-pattern-validate", () => {
  describe("isMalformedPlaywrightUrlGlob", () => {
    it("rejects trailing ** after a path segment", () => {
      expect(isMalformedPlaywrightUrlGlob("**/dashboard/index**")).toBe(true);
      expect(isMalformedPlaywrightUrlGlob("**/auth/login**")).toBe(true);
    });

    it("accepts exact paths and valid globs", () => {
      expect(isMalformedPlaywrightUrlGlob("/dashboard/index")).toBe(false);
      expect(isMalformedPlaywrightUrlGlob("**/dashboard/index")).toBe(false);
      expect(isMalformedPlaywrightUrlGlob("**/login")).toBe(false);
      expect(isMalformedPlaywrightUrlGlob("foo/**")).toBe(false);
    });

    it("ignores patterns without wildcards", () => {
      expect(isMalformedPlaywrightUrlGlob("/auth/login")).toBe(false);
    });
  });

  describe("stringLiteralFromAssertionArg", () => {
    it("extracts quoted string literals", () => {
      expect(stringLiteralFromAssertionArg("'/login'")).toBe("/login");
      expect(stringLiteralFromAssertionArg('"**/dashboard/index**"')).toBe("**/dashboard/index**");
    });

    it("returns undefined for regex and expressions", () => {
      expect(stringLiteralFromAssertionArg("/dashboard\\/index/")).toBeUndefined();
      expect(stringLiteralFromAssertionArg("expected.authUrlPattern")).toBeUndefined();
    });
  });

  describe("classifyUrlPatternAssertionArg", () => {
    it("classifies string, regex, and expression args", () => {
      expect(classifyUrlPatternAssertionArg("'/login'")).toBe("string");
      expect(classifyUrlPatternAssertionArg("/dashboard\\/index/")).toBe("regex");
      expect(classifyUrlPatternAssertionArg("expected.homeUrl")).toBe("expression");
    });

    // Regression coverage for the ReDoS fix in TS_REGEX_LITERAL: [^/] was widened to [^\\/],
    // excluding backslash from the negated class so it can no longer overlap with the \\. branch
    // of the alternation. These cases pin down that the matched language is unchanged.
    it("still classifies realistic regex literals containing escaped slashes and backslashes", () => {
      expect(classifyUrlPatternAssertionArg("/dashboard\\/index/gi")).toBe("regex");
      expect(classifyUrlPatternAssertionArg("/\\d{3}-\\d{4}/")).toBe("regex");
      expect(classifyUrlPatternAssertionArg("/back\\\\slash/")).toBe("regex");
      expect(classifyUrlPatternAssertionArg("/[a-z]+\\/checkout/")).toBe("regex");
    });

    it("still rejects unterminated or empty-body regex-shaped strings", () => {
      expect(classifyUrlPatternAssertionArg("/unterminated")).toBe("expression");
      expect(classifyUrlPatternAssertionArg("/")).toBe("expression");
    });

    it("resolves quickly for a long run of backslashes that used to risk catastrophic backtracking", () => {
      const pathological = "/" + "\\".repeat(2000) + "/Z";
      const start = Date.now();
      classifyUrlPatternAssertionArg(pathological);
      expect(Date.now() - start).toBeLessThan(200);
    });
  });
});

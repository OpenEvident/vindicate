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
  });
});

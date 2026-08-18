import { describe, expect, it } from "vitest";
import {
  allowlistSuitePaths,
  buildPlaywrightTestCommand,
  quotePlaywrightArg,
  suiteLabelFromRelativePath,
  toTestSuiteOptions
} from "../../../src/extension/filesystem/playwrightTestCommand.js";

const known = ["tests/smoke.spec.ts", "tests/login.spec.ts", "tests/checkout/cart.spec.ts"];

describe("playwrightTestCommand", () => {
  it("builds run-all when suites are omitted or empty", () => {
    expect(buildPlaywrightTestCommand(undefined, known)).toBe("npx playwright test");
    expect(buildPlaywrightTestCommand([], known)).toBe("npx playwright test");
  });

  it("builds run-all when every known spec is selected", () => {
    expect(buildPlaywrightTestCommand(known, known)).toBe("npx playwright test");
  });

  it("builds a subset command with posix relative paths", () => {
    expect(buildPlaywrightTestCommand(["tests/smoke.spec.ts"], known)).toBe(
      "npx playwright test tests/smoke.spec.ts"
    );
    expect(buildPlaywrightTestCommand(["tests/smoke.spec.ts", "tests/login.spec.ts"], known)).toBe(
      "npx playwright test tests/smoke.spec.ts tests/login.spec.ts"
    );
  });

  it("drops traversal, unknown, and non-test paths then falls back to run-all", () => {
    expect(
      buildPlaywrightTestCommand(["tests/../secret.spec.ts", "pages/Login.spec.ts"], known)
    ).toBe("npx playwright test");
    expect(allowlistSuitePaths(["tests/../secret.spec.ts"], known)).toEqual([]);
    expect(allowlistSuitePaths(["tests/missing.spec.ts"], known)).toEqual([]);
    expect(allowlistSuitePaths(["README.md"], known)).toEqual([]);
  });

  it("keeps valid files and drops invalid ones in a mixed request", () => {
    expect(
      allowlistSuitePaths(
        ["tests/smoke.spec.ts", "tests/../secret.spec.ts", "tests/missing.spec.ts"],
        known
      )
    ).toEqual(["tests/smoke.spec.ts"]);
    expect(
      buildPlaywrightTestCommand(
        ["tests/smoke.spec.ts", "tests/../secret.spec.ts", "tests/missing.spec.ts"],
        known
      )
    ).toBe("npx playwright test tests/smoke.spec.ts");
  });

  it("quotes paths that contain spaces", () => {
    const spaced = ["tests/my suite.spec.ts"];
    expect(quotePlaywrightArg("tests/my suite.spec.ts")).toBe('"tests/my suite.spec.ts"');
    expect(buildPlaywrightTestCommand(spaced, spaced)).toBe("npx playwright test");
    expect(buildPlaywrightTestCommand(spaced, [...spaced, "tests/smoke.spec.ts"])).toBe(
      'npx playwright test "tests/my suite.spec.ts"'
    );
  });

  it("escapes backslashes before quotes inside quoted args", () => {
    // Without escaping `\`, a trailing `\"` would leave an unescaped quote.
    expect(quotePlaywrightArg('tests\\file".spec.ts')).toBe('"tests\\\\file\\".spec.ts"');
    expect(quotePlaywrightArg("tests/$secret.spec.ts")).toBe('"tests/\\$secret.spec.ts"');
    expect(quotePlaywrightArg("tests/`x`.spec.ts")).toBe('"tests/\\`x\\`.spec.ts"');
  });

  it("derives labels and sorts suite options", () => {
    expect(suiteLabelFromRelativePath("tests/checkout/cart.spec.ts")).toBe("cart");
    expect(toTestSuiteOptions(["tests/login.spec.ts", "tests/smoke.spec.ts"])).toEqual([
      { relativePath: "tests/login.spec.ts", label: "login" },
      { relativePath: "tests/smoke.spec.ts", label: "smoke" }
    ]);
  });
});

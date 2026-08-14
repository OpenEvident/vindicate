import { describe, expect, it } from "vitest";

import { parsePlaywrightJsonReport } from "../../src/mcp/tools/test-tool.js";

describe("parsePlaywrightJsonReport", () => {
  it("extracts test cases from JSON reporter output", () => {
    const stdout = `line reporter\n${JSON.stringify({
      suites: [
        {
          title: "Login",
          file: "tests/login.spec.ts",
          specs: [
            {
              title: "should sign in",
              file: "tests/login.spec.ts",
              tests: [{ results: [{ status: "passed", duration: 1200, retry: 0 }] }]
            }
          ]
        }
      ],
      stats: { duration: 1200 }
    })}`;

    const result = parsePlaywrightJsonReport(stdout);
    expect(result).not.toBeNull();
    expect(result?.passed).toBe(1);
    expect(result?.test_cases[0]?.title).toBe("should sign in");
  });

  it("returns null when stdout has no JSON object", () => {
    expect(parsePlaywrightJsonReport("no json here")).toBeNull();
  });

  it("strips ANSI colour codes from the error message — pure overhead for a text-reading agent", () => {
    const ESC = "\x1b";
    const coloredMessage =
      `Error: ${ESC}[2mexpect(${ESC}[22m${ESC}[31mlocator${ESC}[39m${ESC}[2m).${ESC}[22mtoBeVisible() failed`;
    const stdout = `line reporter\n${JSON.stringify({
      suites: [
        {
          title: "Suite",
          file: "tests/a.spec.ts",
          specs: [
            {
              title: "fails",
              file: "tests/a.spec.ts",
              tests: [
                {
                  results: [{ status: "failed", duration: 100, retry: 0, error: { message: coloredMessage } }]
                }
              ]
            }
          ]
        }
      ],
      stats: { duration: 100 }
    })}`;

    const result = parsePlaywrightJsonReport(stdout);

    expect(result?.test_cases[0]?.error).toBe("Error: expect(locator).toBeVisible() failed");
    expect(result?.test_cases[0]?.error).not.toContain(ESC);
  });

  it("sorts failed-first, then skipped, then passed — so a size trim keeps the most useful entries", () => {
    // Deliberately file/execution order: pass, skip, fail, fail, pass, fail — mirrors the real lab run
    // that motivated this (a pass and a skip up front "protected" from trimming purely by position,
    // while real failures later in the run got cut first).
    const specs = (
      [
        ["LAB-1 pass", "passed"],
        ["LAB-2 skip", "skipped"],
        ["LAB-3 fail", "failed"],
        ["LAB-4 fail", "failed"],
        ["LAB-5 pass", "passed"],
        ["LAB-6 fail", "failed"]
      ] as const
    ).map(([title, status]) => ({
      title,
      file: "tests/lab.spec.ts",
      tests: [{ results: [{ status, duration: 100, retry: 0 }] }]
    }));
    const stdout = `line reporter\n${JSON.stringify({
      suites: [{ title: "Lab", file: "tests/lab.spec.ts", specs }],
      stats: { duration: 600 }
    })}`;

    const result = parsePlaywrightJsonReport(stdout);
    const titles = result?.test_cases.map((t) => t.title);

    // Failures first, in original relative order (LAB-3, LAB-4, LAB-6); then skips (LAB-2); then
    // passes, in original relative order (LAB-1, LAB-5).
    expect(titles).toEqual(["LAB-3 fail", "LAB-4 fail", "LAB-6 fail", "LAB-2 skip", "LAB-1 pass", "LAB-5 pass"]);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaywrightOutputReader } from "../../../src/extension/filesystem/PlaywrightOutputReader";
import type { ILogger } from "../../../src/extension/shared/logger";

function logger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), show: vi.fn() };
}

describe("PlaywrightOutputReader", () => {
  const root = path.join(process.cwd(), "tests", "tmp-playwright");
  const reader = new PlaywrightOutputReader(logger());

  beforeEach(async () => {
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("detects outputFile from playwright.config.ts when the file exists", async () => {
    await writeFile(
      path.join(root, "playwright.config.ts"),
      `export default { reporter: [['json', { outputFile: 'custom-results.json' }]] };`,
      "utf8"
    );
    await writeFile(path.join(root, "custom-results.json"), "{}", "utf8");
    expect(await reader.detectOutputPath(root)).toBe(path.join(root, "custom-results.json"));
  });

  it("ignores config outputFile until the results file is created", async () => {
    await writeFile(
      path.join(root, "playwright.config.ts"),
      `export default { reporter: [['json', { outputFile: 'test-results/results.json' }]] };`,
      "utf8"
    );
    expect(await reader.detectOutputPath(root)).toBeNull();
  });

  it("falls back to test-results.json when config has no JSON reporter", async () => {
    await writeFile(path.join(root, "playwright.config.ts"), `export default {};`, "utf8");
    await writeFile(path.join(root, "test-results.json"), "{}", "utf8");
    expect(await reader.detectOutputPath(root)).toBe(path.join(root, "test-results.json"));
  });

  it("returns null when no output file exists", async () => {
    expect(await reader.detectOutputPath(root)).toBeNull();
  });

  it("sums passed and failed across nested suites", async () => {
    const outputPath = path.join(root, "results.json");
    await writeFile(
      outputPath,
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                tests: [{ results: [{ status: "passed" }] }, { results: [{ status: "failed" }] }]
              }
            ]
          },
          {
            specs: [
              {
                tests: [{ results: [{ status: "timedOut" }, { status: "skipped" }] }]
              }
            ]
          }
        ]
      }),
      "utf8"
    );
    const result = await reader.readResults(outputPath);
    expect(result).toMatchObject({ passed: 1, failed: 2, total: 3 });
  });

  it("groups per-feature totals by spec file slug, not spec title", async () => {
    const outputPath = path.join(root, "results-per-feature.json");
    await writeFile(
      outputPath,
      JSON.stringify({
        suites: [
          {
            title: "Auth suite",
            file: "tests/auth.spec.ts",
            specs: [
              {
                title: "should sign in successfully",
                file: "tests/auth.spec.ts",
                tests: [
                  {
                    results: [{ status: "passed" }]
                  }
                ]
              }
            ]
          }
        ]
      }),
      "utf8"
    );
    const result = await reader.readResults(outputPath);
    expect(result?.perFeature.get("auth")).toEqual({
      passed: 1,
      failed: 0,
      skipped: 0,
      flaky: 0,
      total: 1
    });
  });

  it("maps failure title/file/message from spec and result details", async () => {
    const outputPath = path.join(root, "results-failure-details.json");
    await writeFile(
      outputPath,
      JSON.stringify({
        suites: [
          {
            file: "tests/search.spec.ts",
            specs: [
              {
                title: "[AC-7] returns matching restaurants when searching by name",
                file: "tests/search.spec.ts",
                tests: [
                  {
                    results: [
                      {
                        status: "failed",
                        duration: 5200,
                        error: {
                          message: "Expected 3 results, got 2",
                          location: { file: "tests/search.spec.ts", line: 17 }
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }),
      "utf8"
    );
    const result = await reader.readResults(outputPath);
    expect(result?.failures[0]).toMatchObject({
      title: "[AC-7] returns matching restaurants when searching by name",
      file: "tests/search.spec.ts:17",
      message: "Expected 3 results, got 2",
      feature: "search",
      ac: "AC-7",
      duration: "5.20s"
    });
  });

  it("builds slowestTests from real result durations", async () => {
    const outputPath = path.join(root, "results-slowest.json");
    await writeFile(
      outputPath,
      JSON.stringify({
        suites: [
          {
            file: "tests/auth.spec.ts",
            specs: [
              {
                title: "fast test",
                file: "tests/auth.spec.ts",
                tests: [{ results: [{ status: "passed", duration: 600 }] }]
              },
              {
                title: "slow test",
                file: "tests/auth.spec.ts",
                tests: [{ results: [{ status: "passed", duration: 2100 }] }]
              }
            ]
          }
        ]
      }),
      "utf8"
    );
    const result = await reader.readResults(outputPath);
    expect(result?.slowestTests[0]).toMatchObject({
      title: "slow test",
      feature: "auth",
      duration: "2.10s"
    });
  });

  it("returns null for malformed JSON", async () => {
    const outputPath = path.join(root, "bad.json");
    await writeFile(outputPath, "{bad", "utf8");
    const log = logger();
    const warnReader = new PlaywrightOutputReader(log);
    expect(await warnReader.readResults(outputPath)).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("returns null without warning when results file is missing", async () => {
    const log = logger();
    const silentReader = new PlaywrightOutputReader(log);
    expect(
      await silentReader.readResults(path.join(root, "test-results", "results.json"))
    ).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

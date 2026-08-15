import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildRunTestsPayload,
  readFailureContext,
  MAX_CONTEXT_CHARS,
  MAX_TESTS_WITH_INLINE_CONTEXT,
  type PlaywrightTestCaseResult,
  type RunTestsResult
} from "../../src/mcp/tools/test-tool.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "vindicate-run-tests-context-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function testCase(overrides: Partial<PlaywrightTestCaseResult>): PlaywrightTestCaseResult {
  return {
    title: "a test",
    file: "tests/a.spec.ts",
    status: "passed",
    duration_ms: 100,
    retries: 0,
    ...overrides
  };
}

function runResult(test_cases: PlaywrightTestCaseResult[]): RunTestsResult {
  const failed = test_cases.filter((t) => t.status === "failed" || t.status === "timedOut").length;
  const passed = test_cases.filter((t) => t.status === "passed").length;
  return {
    outcome: failed > 0 ? "fail" : "pass",
    exit_code: failed > 0 ? 1 : 0,
    duration_ms: 1000,
    test_cases,
    total: test_cases.length,
    passed,
    failed,
    skipped: 0
  };
}

describe("readFailureContext", () => {
  it("returns the full content when under the budget", async () => {
    const file = path.join(dir, "error-context.md");
    await writeFile(file, "# Error\n\nsmall context", "utf8");

    const result = await readFailureContext(file);

    expect(result).toEqual({ content: "# Error\n\nsmall context", truncated: false });
  });

  it("truncates a single line with no newlines via a hard slice (pathological fallback)", async () => {
    const file = path.join(dir, "error-context.md");
    const huge = "x".repeat(MAX_CONTEXT_CHARS + 500);
    await writeFile(file, huge, "utf8");

    const result = await readFailureContext(file);

    expect(result?.truncated).toBe(true);
    expect(result?.content.length).toBe(MAX_CONTEXT_CHARS);
  });

  it("cuts on the last full line within budget, never mid-line — a mid-line cut inside error-context.md's ```yaml fence would leave it unclosed", async () => {
    const file = path.join(dir, "error-context.md");
    // Lines of varying length so the budget boundary is very unlikely to land exactly on a newline —
    // this exercises the "back off to the last full line" branch, not the single-long-line fallback.
    const lines = [];
    let total = 0;
    let i = 0;
    while (total < MAX_CONTEXT_CHARS + 500) {
      const line = `line ${i} ${"a".repeat((i % 37) + 1)}`;
      lines.push(line);
      total += line.length + 1;
      i++;
    }
    await writeFile(file, lines.join("\n"), "utf8");

    const result = await readFailureContext(file);

    expect(result?.truncated).toBe(true);
    expect(result?.content.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    // Every returned line must be one of the original whole lines, never a partial fragment of one.
    const returnedLines = result?.content.split("\n") ?? [];
    for (const line of returnedLines) {
      expect(lines).toContain(line);
    }
  });

  it("returns undefined for a missing file instead of throwing", async () => {
    const result = await readFailureContext(path.join(dir, "does-not-exist.md"));
    expect(result).toBeUndefined();
  });
});

describe("buildRunTestsPayload", () => {
  it("attaches no context or attachments to a passing test", async () => {
    const payload = await buildRunTestsPayload(runResult([testCase({ status: "passed" })]));
    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]).not.toHaveProperty("context");
    expect(tests[0]).not.toHaveProperty("attachments");
  });

  it("inlines error-context.md content for a failing test that has one", async () => {
    const contextFile = path.join(dir, "error-context.md");
    await writeFile(contextFile, "# Failure\n\npage snapshot here", "utf8");

    const payload = await buildRunTestsPayload(
      runResult([
        testCase({
          status: "failed",
          error: "expect(locator).toBeVisible() failed",
          attachments: [{ name: "error-context", contentType: "text/markdown", path: contextFile }]
        })
      ])
    );

    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]?.context).toBe("# Failure\n\npage snapshot here");
    expect(tests[0]?.context_truncated).toBe(false);
    expect(tests[0]?.attachments).toEqual([
      { name: "error-context", contentType: "text/markdown", path: contextFile }
    ]);
    expect(payload).not.toHaveProperty("context_note");
  });

  it("also surfaces screenshot/video/trace attachment paths, not just error-context", async () => {
    const contextFile = path.join(dir, "error-context.md");
    await writeFile(contextFile, "ctx", "utf8");
    const screenshotFile = path.join(dir, "test-failed-1.png");
    const traceFile = path.join(dir, "trace.zip");

    const payload = await buildRunTestsPayload(
      runResult([
        testCase({
          status: "failed",
          attachments: [
            { name: "screenshot", contentType: "image/png", path: screenshotFile },
            { name: "error-context", contentType: "text/markdown", path: contextFile },
            { name: "trace", contentType: "application/zip", path: traceFile }
          ]
        })
      ])
    );

    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]?.attachments).toEqual([
      { name: "screenshot", contentType: "image/png", path: screenshotFile },
      { name: "error-context", contentType: "text/markdown", path: contextFile },
      { name: "trace", contentType: "application/zip", path: traceFile }
    ]);
  });

  it("does not fail the whole run when error-context.md is missing — just omits context for that test", async () => {
    const payload = await buildRunTestsPayload(
      runResult([
        testCase({
          status: "failed",
          attachments: [
            { name: "error-context", contentType: "text/markdown", path: path.join(dir, "gone.md") }
          ]
        })
      ])
    );

    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]).not.toHaveProperty("context");
    // The attachment path itself is still surfaced even though the content couldn't be read —
    // the agent can still try to open it directly (e.g. a delayed write, or different permissions).
    expect(tests[0]?.attachments).toEqual([
      { name: "error-context", contentType: "text/markdown", path: path.join(dir, "gone.md") }
    ]);
  });

  it("inlines context for only the first N failing tests, and notes how many more exist", async () => {
    const files = await Promise.all(
      [0, 1, 2, 3, 4].map(async (i) => {
        const f = path.join(dir, `error-context-${i}.md`);
        await writeFile(f, `context ${i}`, "utf8");
        return f;
      })
    );

    const payload = await buildRunTestsPayload(
      runResult(
        files.map((f, i) =>
          testCase({
            title: `failing test ${i}`,
            status: "failed",
            attachments: [{ name: "error-context", contentType: "text/markdown", path: f }]
          })
        )
      )
    );

    const tests = payload.tests as Record<string, unknown>[];
    const withContext = tests.filter((t) => "context" in t);
    const withoutContext = tests.filter((t) => !("context" in t));
    expect(withContext).toHaveLength(MAX_TESTS_WITH_INLINE_CONTEXT);
    expect(withoutContext).toHaveLength(files.length - MAX_TESTS_WITH_INLINE_CONTEXT);
    // Every failing test still gets its attachment path even when its content wasn't inlined.
    for (const t of withoutContext) {
      expect(t.attachments).toBeDefined();
    }
    expect(payload.context_note).toContain(
      `${files.length - MAX_TESTS_WITH_INLINE_CONTEXT} more failed`
    );
  });

  it("counts every un-inlined failure in context_note, including ones with no error-context attachment at all", async () => {
    // Regression: an earlier version only counted failures that had an error-context path AND were
    // over the cap, silently undercounting when a failing test has no attachment at all (e.g. a
    // custom config with screenshot/trace disabled) — that test was never eligible for inlining in
    // the first place, but still needs to be reflected in "how many more failed".
    const contextFile = path.join(dir, "error-context.md");
    await writeFile(contextFile, "ctx", "utf8");

    const payload = await buildRunTestsPayload(
      runResult([
        testCase({
          title: "inlined",
          status: "failed",
          attachments: [{ name: "error-context", path: contextFile }]
        }),
        testCase({ title: "no attachments at all", status: "failed" })
      ])
    );

    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]?.context).toBeDefined();
    expect(tests[1]).not.toHaveProperty("context");
    expect(tests[1]).not.toHaveProperty("attachments");
    expect(payload.context_note).toContain("1 more failed");
  });

  it("context_note doesn't unconditionally promise attachments are visible for every un-inlined failure", async () => {
    // Regression: the note used to say "check each test's own attachments" as a flat instruction —
    // but a separate, later trim step (response-budget.ts, outside this function) can drop whole test
    // entries from `tests` entirely on a run with many failures, making that instruction false for
    // any test that got cut. The note must point at tests_total/tests_shown/truncation_summary as the
    // way to detect that, not assert every failure is present.
    const contextFile = path.join(dir, "error-context.md");
    await writeFile(contextFile, "ctx", "utf8");

    const payload = await buildRunTestsPayload(
      runResult([
        testCase({
          title: "inlined",
          status: "failed",
          attachments: [{ name: "error-context", path: contextFile }]
        }),
        testCase({
          title: "not inlined",
          status: "failed",
          attachments: [{ name: "error-context", path: contextFile }]
        })
      ])
    );

    expect(payload.context_note).not.toContain("check each test's own");
    expect(payload.context_note).toContain("tests_total");
    expect(payload.context_note).toContain("tests_shown");
    expect(payload.context_note).toContain("truncation_summary");
  });

  it("keeps existing fields (outcome, passed/failed/skipped, title/file/status/durationMs/error) unchanged in shape", async () => {
    const payload = await buildRunTestsPayload(
      runResult([
        testCase({ status: "passed", title: "ok test", duration_ms: 250 }),
        testCase({ status: "failed", title: "bad test", error: "boom" })
      ])
    );

    expect(payload.outcome).toBe("fail");
    expect(payload.passed).toBe(1);
    expect(payload.failed).toBe(1);
    expect(payload.skipped).toBe(0);
    const tests = payload.tests as Record<string, unknown>[];
    expect(tests[0]).toMatchObject({
      title: "ok test",
      file: "tests/a.spec.ts",
      status: "passed",
      durationMs: 250
    });
    expect(tests[1]).toMatchObject({ title: "bad test", status: "failed", error: "boom" });
  });
});

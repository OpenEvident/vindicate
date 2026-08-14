import { describe, expect, it } from "vitest";

import { applyResponseBudget, RESPONSE_BUDGET_BY_TOOL } from "../../src/mcp/response-budget.js";

describe("applyResponseBudget", () => {
  it("returns small responses unchanged", () => {
    const data = { entries: [1, 2] };
    expect(applyResponseBudget("browser_get_console_logs", data)).toBe(data);
  });

  it("does not cap browser_read (compact text via maxResultSizeChars instead)", () => {
    const big = { text: "x".repeat(20_000) };
    expect(applyResponseBudget("browser_read", big)).toBe(big);
  });

  it("does not cap unknown tools", () => {
    const big = "y".repeat(50_000);
    expect(applyResponseBudget("browser_click", big)).toBe(big);
  });

  it("truncates run_tests by trimming tests while keeping view", () => {
    const payload = {
      view: "test-run",
      passed: 1,
      failed: 99,
      summary: "ok",
      tests: Array.from({ length: 200 }, (_, i) => ({
        title: `test number ${i} with a long title for size`,
        status: "failed",
        error: "x".repeat(80)
      }))
    };
    const out = applyResponseBudget("run_tests", payload) as Record<string, unknown>;
    expect(out.view).toBe("test-run");
    expect(out.summary).toBe("ok");
    expect(Array.isArray(out.tests)).toBe(true);
    expect((out.tests as unknown[]).length).toBeLessThan(200);
    expect(out.truncation_summary).toBeTypeOf("string");
  });

  it("adds a compact omitted_failures index for cut failures, not just a bare count", () => {
    const payload = {
      view: "test-run",
      passed: 0,
      failed: 200,
      summary: "ok",
      tests: Array.from({ length: 200 }, (_, i) => ({
        title: `failing test ${i}`,
        file: `tests/${i}.spec.ts`,
        status: "failed",
        error: `Error line one for test ${i}\nsome stack trace noise here that shouldn't appear`.repeat(3)
      }))
    };

    const out = applyResponseBudget("run_tests", payload) as Record<string, unknown>;
    const shown = out.tests as Record<string, unknown>[];
    const omitted = out.omitted_failures as Record<string, unknown>[] | undefined;

    expect(shown.length).toBeLessThan(200);
    expect(omitted).toBeDefined();
    expect(omitted!.length).toBeGreaterThan(0);
    // One-line only — the second line ("stack trace noise") must never appear.
    for (const entry of omitted!) {
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("file");
      expect(entry.error).not.toContain("stack trace noise");
    }
    // Every entry corresponds to a test that isn't in the shown array.
    const shownTitles = new Set(shown.map((t) => t.title));
    for (const entry of omitted!) {
      expect(shownTitles.has(entry.title)).toBe(false);
    }
  });

  it("does not add omitted_failures when nothing was cut", () => {
    const payload = { view: "test-run", passed: 1, failed: 0, summary: "ok", tests: [{ title: "a", status: "passed" }] };
    const out = applyResponseBudget("run_tests", payload) as Record<string, unknown>;
    expect(out).not.toHaveProperty("omitted_failures");
  });

  it("does not index cut passed/skipped tests — only failures are worth reporting", () => {
    const passesAndSkips = Array.from({ length: 150 }, (_, i) => ({
      title: `passing test ${i}`,
      status: i % 2 === 0 ? "passed" : "skipped",
      // padding so the payload is large enough to actually trigger trimming
      pad: "x".repeat(80)
    }));
    const payload = { view: "test-run", passed: 75, failed: 0, summary: "ok", tests: passesAndSkips };

    const out = applyResponseBudget("run_tests", payload) as Record<string, unknown>;
    expect(out).not.toHaveProperty("omitted_failures");
  });

  it("keeps the omitted_failures index itself within budget, dropping trailing entries if needed", () => {
    // Every failure's error is deliberately long — even a compact index of all of them could, in
    // principle, blow the budget on its own; the index must trim itself rather than ever pushing the
    // whole payload back over cap.
    const payload = {
      view: "test-run",
      passed: 0,
      failed: 500,
      summary: "ok",
      tests: Array.from({ length: 500 }, (_, i) => ({
        title: `failing test ${i} with a fairly long descriptive title for realism`,
        file: `tests/feature-${i}.spec.ts`,
        status: "failed",
        error: `Error: assertion ${i} failed`.repeat(2)
      }))
    };

    const out = applyResponseBudget("run_tests", payload) as Record<string, unknown>;
    // The while loop in trimRunTestsPayload checks the exact final candidate (tests + omitted_failures
    // together) against cap before returning it, so this should hold with no slack at all.
    const serialised = JSON.stringify(out, null, 2);
    expect(serialised.length).toBeLessThanOrEqual(RESPONSE_BUDGET_BY_TOOL.run_tests!.cap);
  });
});

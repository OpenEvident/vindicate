/**
 * @file run_tests MCP tool — spawns Playwright in the project root (no worker / cloud).
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { formatTestRunSummary } from "../panels/run-summary.js";
import { APP_RESOURCE_URI } from "../resources/vindicate-app-resource.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export interface PlaywrightAttachment {
  readonly name?: string;
  readonly contentType?: string;
  readonly path?: string;
}

export interface PlaywrightTestCaseResult {
  readonly title: string;
  readonly file: string;
  readonly status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  readonly duration_ms: number;
  readonly retries: number;
  readonly error?: string;
  readonly attachments?: PlaywrightAttachment[];
}

interface PlaywrightJsonReport {
  readonly suites?: PlaywrightJsonSuite[];
  readonly stats?: {
    readonly expected?: number;
    readonly unexpected?: number;
    readonly skipped?: number;
    readonly duration?: number;
  };
}

interface PlaywrightJsonSuite {
  readonly title?: string;
  readonly file?: string;
  readonly specs?: PlaywrightJsonSpec[];
  readonly suites?: PlaywrightJsonSuite[];
}

interface PlaywrightJsonSpec {
  readonly title?: string;
  readonly file?: string;
  readonly tests?: PlaywrightJsonTest[];
}

interface PlaywrightJsonTest {
  readonly results?: PlaywrightJsonTestResult[];
}

interface PlaywrightJsonTestResult {
  readonly status?: string;
  readonly duration?: number;
  readonly retry?: number;
  readonly error?: { readonly message?: string };
  readonly attachments?: PlaywrightAttachment[];
}

export interface RunTestsResult {
  readonly outcome: "pass" | "fail" | "error";
  readonly exit_code: number;
  readonly duration_ms: number;
  readonly test_cases: PlaywrightTestCaseResult[];
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * Playwright's JSON reporter carries the same ANSI colour codes it prints to a terminal (`[31m`
 * for red, etc.) inside `error.message` and — since it's just markdown — inside `error-context.md`
 * too. These are pure overhead for a text-reading agent: no information, just bytes, and confirmed
 * live to meaningfully eat into `run_tests`'s response budget across a run with several failures.
 * Stripped everywhere error text is surfaced, before any truncation, so the budget is spent on
 * signal, not terminal styling.
 */
// eslint-disable-next-line no-control-regex -- literal ESC (0x1b) is the actual byte Playwright emits
const ANSI_ESCAPE_PATTERN = /\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, "");
}

export function parsePlaywrightJsonReport(stdout: string): RunTestsResult | null {
  const jsonStart = stdout.indexOf("{");
  const jsonEnd = stdout.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return null;
  }

  let parsed: PlaywrightJsonReport;
  try {
    parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as PlaywrightJsonReport;
  } catch {
    return null;
  }

  const test_cases: PlaywrightTestCaseResult[] = [];
  const walkSuite = (suite: PlaywrightJsonSuite, parentTitle: string): void => {
    const suiteTitle = suite.title ?? parentTitle;
    for (const spec of suite.specs ?? []) {
      const specTitle = spec.title ?? suiteTitle;
      const file = spec.file ?? suite.file ?? "";
      for (const test of spec.tests ?? []) {
        const result = test.results?.[test.results.length - 1];
        if (result === undefined) {
          continue;
        }
        const status = mapPlaywrightStatus(result.status);
        test_cases.push({
          title: specTitle,
          file,
          status,
          duration_ms: Math.round(result.duration ?? 0),
          retries: result.retry ?? 0,
          ...(result.error?.message !== undefined
            ? { error: stripAnsi(result.error.message) }
            : {}),
          ...(result.attachments !== undefined && result.attachments.length > 0
            ? { attachments: result.attachments }
            : {})
        });
      }
    }
    for (const child of suite.suites ?? []) {
      walkSuite(child, suiteTitle);
    }
  };

  for (const suite of parsed.suites ?? []) {
    walkSuite(suite, "");
  }

  // Failed-first, not file/execution order — the response can get trimmed for size (see
  // response-budget.ts), and that trim keeps a prefix of this array. Without this sort, an early pass
  // in the file "protects" itself from trimming purely by accident of position while a real failure
  // later in the run gets cut first — confirmed live on an 8-test run where 3 early tests (1 pass, 1
  // skip, 1 fail) came before 5 more failures, several of which were then trimmed away. Stable sort:
  // ties (e.g. two failures) keep their original relative order.
  test_cases.sort((a, b) => statusPriority(a.status) - statusPriority(b.status));

  const passed = test_cases.filter((t) => t.status === "passed").length;
  const failed = test_cases.filter((t) => t.status === "failed" || t.status === "timedOut").length;
  const skipped = test_cases.filter((t) => t.status === "skipped").length;
  const total = test_cases.length;
  const outcome = failed > 0 ? "fail" : total > 0 && passed === total ? "pass" : "fail";

  return {
    outcome,
    exit_code: outcome === "pass" ? 0 : 1,
    duration_ms: Math.round(parsed.stats?.duration ?? 0),
    test_cases,
    total,
    passed,
    failed,
    skipped
  };
}

function mapPlaywrightStatus(status: string | undefined): PlaywrightTestCaseResult["status"] {
  switch (status) {
    case "passed":
      return "passed";
    case "skipped":
      return "skipped";
    case "timedOut":
      return "timedOut";
    case "interrupted":
      return "interrupted";
    default:
      return "failed";
  }
}

/** Lower sorts first — problem statuses ahead of skipped, ahead of passed (see failed-first sort). */
function statusPriority(status: PlaywrightTestCaseResult["status"]): number {
  switch (status) {
    case "failed":
    case "timedOut":
    case "interrupted":
      return 0;
    case "skipped":
      return 1;
    case "passed":
      return 2;
  }
}

function resultFromExitCode(exitCode: number, durationMs: number): RunTestsResult {
  return {
    outcome: exitCode === 0 ? "pass" : "fail",
    exit_code: exitCode,
    duration_ms: durationMs,
    test_cases: [],
    total: 0,
    passed: 0,
    failed: exitCode === 0 ? 0 : 1,
    skipped: 0
  };
}

async function runPlaywrightTests(
  projectRoot: string,
  opts: {
    spec_filter?: string;
    grep?: string;
    timeout_ms?: number;
    workers?: number;
  }
): Promise<{ result: RunTestsResult; stdout: string }> {
  const args = ["playwright", "test", "--reporter=json"];
  if (opts.spec_filter !== undefined) {
    args.push(opts.spec_filter);
  }
  if (opts.grep !== undefined) {
    args.push("--grep", opts.grep);
  }
  args.push("--workers", String(opts.workers ?? 1));

  const t0 = Date.now();
  const stdoutChunks: string[] = [];

  return await new Promise<{ result: RunTestsResult; stdout: string }>((resolve, reject) => {
    let settled = false;
    const finish = (result: RunTestsResult, stdout: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ result, stdout });
    };

    const child = spawn("npx", args, {
      cwd: projectRoot,
      env: { ...process.env },
      shell: process.platform === "win32"
    });

    const timeoutMs = opts.timeout_ms;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(
          {
            outcome: "error",
            exit_code: -1,
            duration_ms: Date.now() - t0,
            test_cases: [],
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0
          },
          stdoutChunks.join("")
        );
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(chunk.toString());
    });

    child.on("error", (err: Error) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      const durationMs = Date.now() - t0;
      const exitCode = code ?? 1;
      const stdout = stdoutChunks.join("");
      const fromJson = parsePlaywrightJsonReport(stdout);
      if (fromJson !== null) {
        finish({ ...fromJson, exit_code: exitCode, duration_ms: durationMs }, stdout);
        return;
      }
      finish(resultFromExitCode(exitCode, durationMs), stdout);
    });
  });
}

/** Failing tests get their full-page-state context.md inlined, up to this many per run — a run with
 * many failures still gets bounded response size; the rest still get their attachment paths, just not
 * the inlined content. Kept at 1: `run_tests`'s own response budget (response-budget.ts) trims whole
 * test entries once the *entire* payload exceeds its cap — confirmed live that inlining more than one
 * rich context pushes even a single-failure run over that cap and silently drops the test entry
 * entirely (worse than not inlining at all). One rich context is enough to start diagnosing in the
 * common case (many failures in one run usually share the same root cause anyway).
 */
/** @internal Exported for unit tests. */
export const MAX_TESTS_WITH_INLINE_CONTEXT = 1;

/** Per-test context budget — deliberately smaller than `browser_read`'s own BROWSER_READ_CHAR_BUDGET
 * (8000): that budget is sized for being the *entire* response, but this context is one field inside a
 * `run_tests` payload that has its own separate, much tighter overall budget (see response-budget.ts). */
/** @internal Exported for unit tests. */
export const MAX_CONTEXT_CHARS = 3_000;

/**
 * Reads Playwright's auto-generated `error-context.md` (an AI-directed failure explanation plus a full
 * accessibility-tree snapshot of the page at the moment of failure — see attachments named
 * "error-context" in the JSON reporter output) and truncates it to MAX_CONTEXT_CHARS. Any read failure
 * (older Playwright, custom config with the attachment disabled, a moved/deleted file) is swallowed to
 * `undefined` — this is best-effort context, never a reason to fail the whole test run report.
 */
/** @internal Exported for unit tests. */
export async function readFailureContext(
  path: string
): Promise<{ readonly content: string; readonly truncated: boolean } | undefined> {
  try {
    // error-context.md is plain markdown with no ANSI codes in practice (confirmed against real
    // Playwright output) — stripAnsi here is a cheap no-op guard, not a fix for an observed problem,
    // in case that ever changes.
    const raw = stripAnsi(await readFile(path, "utf8"));
    if (raw.length <= MAX_CONTEXT_CHARS) {
      return { content: raw, truncated: false };
    }
    // Cut on the last full line within budget, not a raw character slice — error-context.md is
    // markdown with a ```yaml fence around the page snapshot; a mid-line cut can leave that fence
    // unclosed and corrupt everything rendered after it. Falls back to a hard slice only in the
    // pathological case of a single line longer than the whole budget.
    const slice = raw.slice(0, MAX_CONTEXT_CHARS);
    const lastNewline = slice.lastIndexOf("\n");
    const content = lastNewline > 0 ? slice.slice(0, lastNewline) : slice;
    return { content, truncated: true };
  } catch {
    return undefined;
  }
}

/** @internal Exported for unit tests. */
export async function buildRunTestsPayload(
  result: RunTestsResult
): Promise<Record<string, unknown>> {
  let inlinedCount = 0;

  // Sequential, not Promise.all(map(...)) — the inline cap must apply to the first N failing tests in
  // order. Running the reads concurrently would let every test race past the `inlinedCount` check
  // before any of them increments it, defeating the cap entirely.
  const tests: Record<string, unknown>[] = [];
  for (const c of result.test_cases) {
    const isFailure = c.status === "failed" || c.status === "timedOut";
    const attachments = isFailure
      ? (c.attachments ?? []).filter(
          (a): a is { name?: string; contentType?: string; path: string } => a.path !== undefined
        )
      : [];

    let context: string | undefined;
    let contextTruncated = false;
    if (isFailure && attachments.length > 0 && inlinedCount < MAX_TESTS_WITH_INLINE_CONTEXT) {
      const errorContextPath = attachments.find((a) => a.name === "error-context")?.path;
      if (errorContextPath !== undefined) {
        const read = await readFailureContext(errorContextPath);
        if (read !== undefined) {
          context = read.content;
          contextTruncated = read.truncated;
          inlinedCount++;
        }
      }
    }

    tests.push({
      title: c.title,
      file: c.file,
      status: c.status === "timedOut" ? "failed" : c.status,
      ...(c.duration_ms > 0 ? { durationMs: c.duration_ms } : {}),
      ...(c.error !== undefined ? { error: c.error } : {}),
      ...(context !== undefined ? { context, context_truncated: contextTruncated } : {}),
      ...(attachments.length > 0
        ? {
            attachments: attachments.map((a) => ({
              name: a.name,
              contentType: a.contentType,
              path: a.path
            }))
          }
        : {})
    });
  }

  // Total failing tests minus however many actually got inlined content — not a count of "how many
  // had an error-context path and were over the cap", which would silently undercount whenever a
  // failing test has no error-context attachment at all (e.g. attachments disabled in a custom
  // config) and so was never eligible for inlining in the first place.
  const moreFailed = result.failed - inlinedCount;

  return {
    view: "test-run",
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    outcome: result.outcome,
    duration_s: parseFloat((result.duration_ms / 1000).toFixed(1)),
    summary: formatTestRunSummary({
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      duration_ms: result.duration_ms
    }),
    ...(moreFailed > 0
      ? {
          // Deliberately doesn't promise every non-inlined failure is visible below with its own
          // attachments — this note is computed before the separate, outer response-size trim
          // (response-budget.ts) runs, which can drop whole test entries from the end of `tests` on a
          // run with many failures. If a test doesn't appear in `tests` at all, check `tests_total` /
          // `tests_shown` / `truncation_summary` — that means it was cut for size, not that it doesn't
          // have diagnostics; narrow with spec_filter/grep and re-run to see it.
          context_note:
            `Inlined page-state context for ${inlinedCount} failing test(s) (cap ${MAX_TESTS_WITH_INLINE_CONTEXT} per run) — ` +
            `${moreFailed} more failed. Each one still has its own "attachments" (error-context/screenshot/video/trace paths) ` +
            `if it appears in "tests" below — check tests_total/tests_shown/truncation_summary for any cut for size.`
        }
      : {}),
    tests
  };
}

function runTestsErrorPayload(stdout: string): Record<string, unknown> {
  return {
    view: "test-run",
    outcome: "error",
    passed: 0,
    failed: 0,
    skipped: 0,
    duration_s: 0,
    summary: "Test run failed — no JSON output captured.",
    raw_output: stdout.slice(0, 2000),
    tests: []
  };
}

export function registerTestTool(server: McpServer, projectRoot: string): void {
  registerAppTool(
    server,
    "run_tests",
    {
      description:
        "Runs Playwright tests in the project root and returns inline pass/fail results. Use after writing or fixing specs. Do not use npx or shell directly.",
      inputSchema: {
        spec_filter: z.string().optional(),
        grep: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
        workers: z.number().int().positive().optional()
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI } }
    },
    async (args) => {
      try {
        const { result, stdout } = await runPlaywrightTests(projectRoot, {
          ...(args.spec_filter !== undefined ? { spec_filter: args.spec_filter } : {}),
          ...(args.grep !== undefined ? { grep: args.grep } : {}),
          ...(args.timeout_ms !== undefined ? { timeout_ms: args.timeout_ms } : {}),
          ...(args.workers !== undefined ? { workers: args.workers } : {})
        });

        if (result.outcome === "error") {
          return toolJson(runTestsErrorPayload(stdout), "run_tests");
        }

        return toolJson(await buildRunTestsPayload(result), "run_tests");
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

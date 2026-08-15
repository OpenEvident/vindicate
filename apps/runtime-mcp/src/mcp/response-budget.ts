export interface ResponseBudgetConfig {
  readonly cap: number;
  readonly summary: (shown: number, total: number) => string;
}

export const RESPONSE_BUDGET_BY_TOOL: Record<string, ResponseBudgetConfig> = {
  browser_get_console_logs: {
    cap: 2_000,
    summary: (shown, total) =>
      `Showing first ${shown} of ${total} chars. Filter by level or since_snapshot_id to reduce volume.`
  },
  browser_get_network_logs: {
    cap: 3_000,
    summary: (shown, total) =>
      `Showing first ${shown} of ${total} chars. Add url_contains or status_min filters.`
  },
  run_tests: {
    // Bumped from 6_000: test-tool.ts now inlines one failing test's error-context.md (up to
    // MAX_CONTEXT_CHARS there, 3_000) — confirmed live that at the old cap, adding that field to even
    // a single-failure run pushed the whole payload over budget and this trimmer dropped the test
    // entry entirely, losing even the plain error message that fit fine before. This still trims
    // (not unbounded) once a run has many failing tests.
    cap: 10_000,
    summary: (shown, total) =>
      `Showing first ${shown} of ${total} chars. Open the HTML report locally for full failure details.`
  }
};

function serialise(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

/** A cut test entry, shaped compactly for the omitted-failures index — never the full entry (that
 * defeats the point of trimming), just enough to judge "same root cause as what I can already see, or
 * worth a scoped re-run" without another round trip. */
function toOmittedFailureEntry(
  test: unknown
): { title: unknown; file: unknown; error?: string } | undefined {
  if (typeof test !== "object" || test === null) {
    return undefined;
  }
  const rec = test as Record<string, unknown>;
  if (rec.status !== "failed") {
    return undefined;
  }
  const rawError = typeof rec.error === "string" ? rec.error : undefined;
  // First line only, short cap — this index exists specifically to stay cheap; the full error/context
  // is still reachable via a scoped re-run (spec_filter/grep) once the agent decides it's needed.
  const oneLineError = rawError?.split("\n")[0]?.slice(0, 150);
  return {
    title: rec.title,
    file: rec.file,
    ...(oneLineError !== undefined && oneLineError.length > 0 ? { error: oneLineError } : {})
  };
}

function buildTrimResult(
  payload: Record<string, unknown>,
  base: Record<string, unknown>,
  tests: unknown[],
  kept: number,
  summary: (shown: number, total: number) => string
): Record<string, unknown> {
  const shown = tests.slice(0, kept);
  return {
    ...payload,
    tests: shown,
    truncation_summary: summary(
      serialise({ ...base, tests: shown }).length,
      serialise(payload).length
    ),
    tests_total: tests.length,
    tests_shown: kept
  };
}

function trimRunTestsPayload(
  payload: Record<string, unknown>,
  cap: number,
  summary: (shown: number, total: number) => string
): Record<string, unknown> {
  const tests = payload.tests;
  if (!Array.isArray(tests)) {
    return payload;
  }

  const base = { ...payload, tests: [] as unknown[] };

  // The candidate at each step includes truncation_summary/tests_total/tests_shown, not just the
  // trimmed tests array — those bookkeeping fields have a real (if small) size of their own. Checking
  // only `{ ...payload, tests: tests.slice(0, i) }` here (the trimmed array alone, no bookkeeping) let
  // the final result quietly overshoot cap by their size; a stricter test on the omitted-failures work
  // caught it. Kept as a plain reverse scan (matches the previous approach) rather than a binary
  // search — run counts here are small enough that it's not worth the complexity.
  let kept = tests.length;
  let result = payload;
  while (kept >= 0) {
    const candidate =
      kept === tests.length ? payload : buildTrimResult(payload, base, tests, kept, summary);
    if (serialise(candidate).length <= cap) {
      result = candidate;
      break;
    }
    kept--;
  }

  if (kept >= tests.length) {
    return payload;
  }

  // Every cut *failure* (not pass/skip — nothing to add there) gets a one-line index entry so the
  // agent isn't left with a bare count. Budget-aware in its own right: this index exists to help
  // within the size limit, not to reopen the exact problem it's mitigating, so entries are dropped
  // from the end (same "keep the earliest, most-likely-root-cause ones" bias as the main sort) until
  // the whole payload fits again.
  const omittedFailures = tests
    .slice(kept)
    .map(toOmittedFailureEntry)
    .filter((e): e is { title: unknown; file: unknown; error?: string } => e !== undefined);

  while (omittedFailures.length > 0) {
    const candidate = { ...result, omitted_failures: omittedFailures };
    if (serialise(candidate).length <= cap) {
      return candidate;
    }
    omittedFailures.pop();
  }

  return result;
}

export function applyResponseBudget(toolName: string, response: unknown): unknown {
  const budget = RESPONSE_BUDGET_BY_TOOL[toolName];
  if (budget === undefined) {
    return response;
  }

  if (
    toolName === "run_tests" &&
    typeof response === "object" &&
    response !== null &&
    !Array.isArray(response)
  ) {
    const payload = response as Record<string, unknown>;
    if (serialise(payload).length <= budget.cap) {
      return response;
    }
    return trimRunTestsPayload(payload, budget.cap, budget.summary);
  }

  const text = serialise(response);
  if (text.length <= budget.cap) {
    return response;
  }

  const content = text.slice(0, budget.cap);
  return {
    content,
    truncation_summary: budget.summary(budget.cap, text.length)
  };
}

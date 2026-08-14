/**
 * @file Brief chat summaries for test run results.
 */

export interface RunCounts {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly duration_ms: number;
}

export function formatTestRunSummary(counts: RunCounts): string {
  const seconds = (counts.duration_ms / 1000).toFixed(1);
  return `✅ ${counts.passed} passed  ❌ ${counts.failed} failed  ⏱️ ${seconds}s`;
}

import type { DashboardMetrics, MetricAvailability, MetricId, MetricState } from "./types";

export interface MetricsScanContext {
  featuresDirExists: boolean;
  playwrightResultsFound: boolean;
}

export type DashboardMetricsCore = Omit<DashboardMetrics, "availability">;

function state(
  ready: boolean,
  reason: string,
  opts?: { dependsOn?: MetricId[]; blockedBy?: string[] }
): MetricState {
  const result: MetricState = { ready, reason };
  if (opts?.dependsOn) result.dependsOn = opts.dependsOn;
  if (opts?.blockedBy) result.blockedBy = opts.blockedBy;
  return result;
}

export function buildMetricAvailability(
  metrics: DashboardMetricsCore,
  scan: MetricsScanContext
): MetricAvailability {
  const featureCount = metrics.features.length;
  const hasSpecs = featureCount > 0;
  const tracedCount = metrics.features.filter((f) => f.hasTests).length;

  const specBlockedBy = !scan.featuresDirExists
    ? [".vindicate/stories/"]
    : !hasSpecs
      ? [".vindicate/stories/*.story.md"]
      : undefined;

  const spec = !scan.featuresDirExists
    ? state(false, "Missing folder: .vindicate/stories/", { blockedBy: [".vindicate/stories/"] })
    : !hasSpecs
      ? state(
          false,
          "No feature specs yet — add .vindicate/stories/<name>.story.md (Getting Started Step 3)",
          {
            blockedBy: [".vindicate/stories/*.story.md"]
          }
        )
      : state(true, `${featureCount} feature spec${featureCount === 1 ? "" : "s"} analyzed`);

  const trace = !hasSpecs
    ? state(
        false,
        "Needs feature specs before test traceability can be measured",
        specBlockedBy ? { dependsOn: ["spec"], blockedBy: specBlockedBy } : { dependsOn: ["spec"] }
      )
    : tracedCount === 0
      ? state(true, "No tests linked to feature names yet", { dependsOn: ["spec"] })
      : state(true, `${tracedCount} of ${featureCount} features have linked tests`, {
          dependsOn: ["spec"]
        });

  const playwrightBlocked = [
    "test-results.json",
    "results.json",
    "playwright-report/results.json",
    "or playwright.config outputFile"
  ];

  const testHealth = !scan.playwrightResultsFound
    ? state(false, "No Playwright results file — run your test suite once", {
        blockedBy: playwrightBlocked
      })
    : metrics.testHealth === null
      ? state(false, "Results file found but could not be read", { blockedBy: playwrightBlocked })
      : state(true, `${metrics.testHealth.passed} passed, ${metrics.testHealth.failed} failed`);

  const freshness = !scan.playwrightResultsFound
    ? state(false, "No test results file found", {
        dependsOn: ["testHealth"],
        blockedBy: playwrightBlocked
      })
    : metrics.testFreshnessDays === null
      ? state(false, "Could not determine last test run time", { dependsOn: ["testHealth"] })
      : state(
          true,
          metrics.testFreshnessDays === 0
            ? "Results from today"
            : `Last run ${metrics.testFreshnessDays} day${metrics.testFreshnessDays === 1 ? "" : "s"} ago`
        );

  const blockers: string[] = [];
  if (!spec.ready) blockers.push(spec.reason);
  if (!trace.ready && !hasSpecs) blockers.push(trace.reason);
  else if (!testHealth.ready) blockers.push(testHealth.reason);

  const health = state(
    blockers.length === 0,
    blockers.length === 0
      ? "Score reflects spec quality, test tracing, pass rate, and result freshness"
      : blockers.slice(0, 2).join(" · ")
  );

  return { spec, trace, testHealth, freshness, health };
}

export function attachMetricAvailability(
  metrics: DashboardMetricsCore,
  scan: MetricsScanContext
): DashboardMetrics {
  return { ...metrics, availability: buildMetricAvailability(metrics, scan) };
}

export function createEmptyDashboardMetrics(): DashboardMetrics {
  const core: DashboardMetricsCore = {
    project: "workspace",
    mode: "BUILD",
    branch: "main",
    specCompleteness: 0,
    testTraceability: 0,
    testHealth: null,
    testFreshnessDays: null,
    health: {
      overall: 0,
      delta: 0,
      grade: "D",
      spec: {
        value: 0,
        label: "Spec completeness",
        weight: 40,
        ready: false,
        blurb: "No specs yet"
      },
      trace: {
        value: 0,
        label: "Traceability",
        weight: 30,
        ready: false,
        blurb: "No linked tests yet"
      },
      pass: {
        value: 0,
        label: "Pass rate",
        weight: 20,
        ready: false,
        blurb: "No Playwright results"
      },
      fresh: {
        value: 0,
        label: "Freshness",
        weight: 10,
        ready: false,
        blurb: "No test run detected"
      }
    },
    tests: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      durationMs: 0,
      durationLabel: "0s",
      lastRunAt: "Not run",
      lastRunAbs: "Not run",
      config: "playwright.config.ts",
      project: "chromium",
      trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    features: [],
    failures: [],
    alerts: [],
    storyWarnings: [],
    acCoverage: {
      total: 0,
      covered: 0,
      drift: 0,
      missing: 0
    },
    specSchema: {
      required: ["Persona", "Feature", "Acceptance Criteria", "Testcases", "Out of Scope"]
    },
    runs: [],
    slowestTests: [],
    healthScore: 0,
    healthGrade: "D",
    healthDelta: 0,
    lastUpdated: new Date().toISOString()
  };
  return attachMetricAvailability(core, {
    featuresDirExists: false,
    playwrightResultsFound: false
  });
}

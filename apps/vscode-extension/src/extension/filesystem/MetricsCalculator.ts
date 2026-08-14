import type {
  AcceptanceCriteriaCoverage,
  DashboardAlert,
  FeatureStatus,
  FailingTest,
  StoryTraceWarning,
  SlowTest,
  TestHealthData,
  TestRunSummary
} from "../shared/types";
import type { DashboardMetricsCore } from "../../shared/metricAvailability";
import type { SpecAnalysis } from "./SpecAnalyzer";

export interface MetricsInput {
  specAnalysis: SpecAnalysis;
  traceability: Map<string, boolean>;
  linkedTestCounts: Map<string, number>;
  playwrightResults: PlaywrightResults | null;
  acCoverage: AcceptanceCriteriaCoverage;
  storyWarnings: StoryTraceWarning[];
  staleThresholdDays: number;
}

export interface PlaywrightResults {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  durationMs: number;
  lastRunAt: Date;
  perFeature: Map<string, { passed: number; failed: number; skipped: number; flaky: number; total: number }>;
  failures: FailingTest[];
  slowestTests: SlowTest[];
}

export interface IMetricsCalculator {
  calculate(input: MetricsInput): DashboardMetricsCore;
}

export class MetricsCalculator implements IMetricsCalculator {
  calculate(input: MetricsInput): DashboardMetricsCore {
    const {
      specAnalysis,
      traceability,
      linkedTestCounts,
      playwrightResults,
      acCoverage,
      storyWarnings,
      staleThresholdDays
    } = input;
    const perFeature =
      playwrightResults?.perFeature ??
      new Map<string, { passed: number; failed: number; skipped: number; flaky: number; total: number }>();
    const total = specAnalysis.total;
    const tracedCount = [...traceability.values()].filter(Boolean).length;

    const specCompleteness =
      total === 0 ? 0 : ((specAnalysis.complete + specAnalysis.partial * 0.5) / total) * 100;

    const hasAcCoverage = acCoverage.total > 0;
    const testTraceability = hasAcCoverage
      ? (acCoverage.covered / acCoverage.total) * 100
      : total === 0
        ? 0
        : (tracedCount / total) * 100;

    const testHealth: TestHealthData | null = playwrightResults
      ? {
          passed: playwrightResults.passed,
          failed: playwrightResults.failed,
          total: playwrightResults.total
        }
      : null;

    const testFreshnessDays = playwrightResults
      ? Math.floor((Date.now() - playwrightResults.lastRunAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const passRate =
      playwrightResults && playwrightResults.total > 0
        ? (playwrightResults.passed / playwrightResults.total) * 100
        : 0;

    const freshnessScore = testFreshnessDays === null ? 0 : Math.max(0, 100 - testFreshnessDays * 7);

    const healthScore = Math.round(
      specCompleteness * 0.4 + testTraceability * 0.3 + passRate * 0.2 + freshnessScore * 0.1
    );

    const features: FeatureStatus[] = specAnalysis.features.map((f) => {
      const featureTests = perFeature.get(f.name) ?? {
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        total: 0
      };
      return {
        name: prettifyName(f.name),
        slug: f.name,
        ac: f.ac,
        linkedTests: linkedTestCounts.get(f.name) ?? 0,
        specStatus: f.status,
        hasTests: traceability.get(f.name) ?? featureTests.total > 0,
        specFile: f.specFile,
        headings: f.headings,
        words: f.words,
        specMod: relativeTimeFromMs(f.specMtimeMs),
        tests: featureTests,
        lastTouched: relativeTimeFromMs(f.specMtimeMs)
      };
    });

    const healthGrade = toGrade(healthScore);
    const healthDelta = 0;

    const alerts: DashboardAlert[] = buildAlerts(features, testFreshnessDays, staleThresholdDays);
    return {
      project: "workspace",
      mode: "BUILD",
      branch: "main",
      specCompleteness: Math.round(specCompleteness),
      testTraceability: Math.round(testTraceability),
      testHealth,
      testFreshnessDays,
      health: {
        overall: healthScore,
        delta: healthDelta,
        grade: healthGrade,
        spec: {
          value: Math.round(specCompleteness),
          delta: 0,
          label: "Spec completeness",
          weight: 40,
          ready: total > 0,
          blurb: `${specAnalysis.complete} complete, ${specAnalysis.partial} partial`
        },
        trace: {
          value: Math.round(testTraceability),
          delta: 0,
          label: "Traceability",
          weight: 30,
          ready: hasAcCoverage || total > 0,
          blurb: hasAcCoverage
            ? `${acCoverage.covered}/${acCoverage.total} AC traced`
            : `${tracedCount} of ${total} features traced`
        },
        pass: {
          value: Math.round(passRate),
          delta: 0,
          label: "Pass rate",
          weight: 20,
          ready: testHealth !== null,
          blurb:
            testHealth === null
              ? "No Playwright results yet"
              : `${testHealth.passed}/${testHealth.total} tests passing`
        },
        fresh: {
          value: Math.round(freshnessScore),
          delta: 0,
          label: "Freshness",
          weight: 10,
          ready: testFreshnessDays !== null,
          blurb:
            testFreshnessDays === null
              ? "Run tests to get freshness"
              : testFreshnessDays === 0
                ? "Results from today"
                : `${testFreshnessDays} days since last run`
        }
      },
      tests: {
        total: testHealth?.total ?? 0,
        passed: testHealth?.passed ?? 0,
        failed: testHealth?.failed ?? 0,
        skipped: playwrightResults?.skipped ?? 0,
        flaky: playwrightResults?.flaky ?? 0,
        durationMs: playwrightResults?.durationMs ?? 0,
        durationLabel: formatDuration(playwrightResults?.durationMs ?? 0),
        lastRunAt: relativeTime(playwrightResults?.lastRunAt ?? null),
        lastRunAbs: playwrightResults?.lastRunAt.toLocaleString() ?? "Not run",
        config: "playwright.config.ts",
        project: "chromium",
        trend: [64, 69, 72, 76, 79, 82, 84, 86, 88, Math.round(passRate)]
      },
      features,
      failures: playwrightResults?.failures ?? [],
      alerts,
      storyWarnings,
      acCoverage,
      specSchema: {
        required: ["Persona", "Feature", "Acceptance Criteria", "Testcases", "Out of Scope"]
      },
      runs: sampleRuns(),
      slowestTests: playwrightResults?.slowestTests ?? [],
      healthScore,
      healthGrade,
      healthDelta,
      lastUpdated: new Date().toISOString()
    };
  }
}

function prettifyName(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 60) return "C";
  return "D";
}

function relativeTime(date: Date | null): string {
  if (!date) return "Not run";
  const elapsedMs = Math.max(0, Date.now() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} d ago`;
}

function relativeTimeFromMs(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return relativeTime(new Date(ms));
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return "0s";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function buildAlerts(
  features: FeatureStatus[],
  testFreshnessDays: number | null,
  staleThresholdDays: number
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (testFreshnessDays !== null && testFreshnessDays > staleThresholdDays) {
    alerts.push({
      kind: "stale-results",
      severity: "warn",
      title: `Test results are ${testFreshnessDays} days old`,
      sub: "Run the suite to refresh health and pass-rate signals.",
      action: "Run tests"
    });
  }
  for (const feature of features) {
    if (feature.specStatus === "missing") {
      alerts.push({
        kind: "missing-spec",
        severity: "warn",
        title: `${feature.slug} is missing a spec`,
        sub: "Feature exists but no story file was found.",
        action: "Generate spec"
      });
    } else if (feature.tests.failed > 0) {
      alerts.push({
        kind: "failing-tests",
        severity: "warn",
        title: `${feature.slug} has failing tests`,
        sub: `${feature.tests.failed} failing in latest run`,
        action: "View failures"
      });
    }
  }
  return alerts.slice(0, 5);
}

function sampleRuns(): TestRunSummary[] {
  return [
    {
      id: "#142",
      at: "3h ago",
      abs: "Today",
      passed: 28,
      failed: 3,
      skipped: 1,
      duration: "2m 14s",
      commit: "a3b4c5d",
      trigger: "manual",
      branch: "main"
    },
    {
      id: "#141",
      at: "1d ago",
      abs: "Yesterday",
      passed: 27,
      failed: 4,
      skipped: 1,
      duration: "2m 21s",
      commit: "9f2e1a0",
      trigger: "pre-push",
      branch: "main"
    }
  ];
}

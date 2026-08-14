import { describe, expect, it } from "vitest";
import { MetricsCalculator } from "../../../src/extension/filesystem/MetricsCalculator";
import type { MetricsInput, PlaywrightResults } from "../../../src/extension/filesystem/MetricsCalculator";
import type { SpecFeatureAnalysis } from "../../../src/extension/filesystem/SpecAnalyzer";

function baseInput(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    specAnalysis: { total: 0, complete: 0, partial: 0, missing: 0, features: [] },
    traceability: new Map(),
    linkedTestCounts: new Map(),
    playwrightResults: null,
    acCoverage: { total: 0, covered: 0, drift: 0, missing: 0 },
    storyWarnings: [],
    staleThresholdDays: 3,
    ...overrides
  };
}

function playwrightResults(
  overrides: Partial<PlaywrightResults> & Pick<PlaywrightResults, "passed" | "failed" | "total" | "lastRunAt">
): PlaywrightResults {
  return {
    skipped: 0,
    flaky: 0,
    durationMs: 0,
    perFeature: new Map(),
    failures: [],
    slowestTests: [],
    ...overrides
  };
}

function feature(name: string, status: "complete" | "partial" | "missing"): SpecFeatureAnalysis {
  return {
    name,
    status,
    storyStatus: "unknown",
    ac: 0,
    acIds: [],
    scenarioAcMap: {},
    headings: {
      feature: false,
      persona: false,
      acceptanceCriteria: false,
      testcases: false,
      outOfScope: false
    },
    specFile: `.vindicate/stories/${name}.story.md`,
    specMtimeMs: 0,
    words: 0
  };
}

describe("MetricsCalculator", () => {
  const calc = new MetricsCalculator();

  it("returns healthScore 0 when all specs missing and no traces", () => {
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 2,
          complete: 0,
          partial: 0,
          missing: 2,
          features: [
            feature("a", "missing"),
            feature("b", "missing")
          ]
        },
        traceability: new Map([
          ["a", false],
          ["b", false]
        ])
      })
    );
    expect(result.healthScore).toBe(0);
    expect(result.testHealth).toBeNull();
  });

  it("returns healthScore near 100 when all complete, traced, passed, fresh", () => {
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 1,
          complete: 1,
          partial: 0,
          missing: 0,
          features: [feature("auth", "complete")]
        },
        traceability: new Map([["auth", true]]),
        playwrightResults: playwrightResults({
          passed: 10,
          failed: 0,
          total: 10,
          lastRunAt: new Date()
        })
      })
    );
    expect(result.healthScore).toBeGreaterThanOrEqual(95);
    expect(result.testHealth).toEqual({ passed: 10, failed: 0, total: 10 });
  });

  it("weights partial specs at 0.5 for spec completeness", () => {
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 2,
          complete: 0,
          partial: 2,
          missing: 0,
          features: [
            feature("a", "partial"),
            feature("b", "partial")
          ]
        },
        traceability: new Map([
          ["a", true],
          ["b", true]
        ])
      })
    );
    expect(result.specCompleteness).toBe(50);
  });

  it("freshness: <1 day scores 100 contribution", () => {
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 1,
          complete: 1,
          partial: 0,
          missing: 0,
          features: [feature("a", "complete")]
        },
        traceability: new Map([["a", true]]),
        playwrightResults: playwrightResults({
          passed: 1,
          failed: 0,
          total: 1,
          lastRunAt: new Date()
        })
      })
    );
    expect(result.testFreshnessDays).toBe(0);
    expect(result.healthScore).toBeGreaterThan(80);
  });

  it("freshness: 2 days uses 60 score band", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 1,
          complete: 1,
          partial: 0,
          missing: 0,
          features: [feature("a", "complete")]
        },
        traceability: new Map([["a", true]]),
        playwrightResults: playwrightResults({
          passed: 1,
          failed: 0,
          total: 1,
          lastRunAt: twoDaysAgo
        })
      })
    );
    expect(result.testFreshnessDays).toBe(2);
  });

  it("testHealth is null when no Playwright results", () => {
    const result = calc.calculate(baseInput());
    expect(result.testHealth).toBeNull();
  });

  it("uses AC coverage for traceability score when AC data exists", () => {
    const result = calc.calculate(
      baseInput({
        specAnalysis: {
          total: 2,
          complete: 2,
          partial: 0,
          missing: 0,
          features: [
            feature("a", "complete"),
            feature("b", "complete")
          ]
        },
        traceability: new Map([
          ["a", true],
          ["b", true]
        ]),
        acCoverage: { total: 10, covered: 6, drift: 2, missing: 4 }
      })
    );

    expect(result.testTraceability).toBe(60);
    expect(result.health.trace.value).toBe(60);
    expect(result.health.trace.blurb).toContain("6/10 AC traced");
  });
});

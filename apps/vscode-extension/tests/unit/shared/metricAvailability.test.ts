import { describe, expect, it } from "vitest";
import {
  attachMetricAvailability,
  buildMetricAvailability,
  createEmptyDashboardMetrics
} from "../../../src/shared/metricAvailability";

describe("metricAvailability", () => {
  it("createEmptyDashboardMetrics marks all inputs blocked", () => {
    const m = createEmptyDashboardMetrics();
    expect(m.availability.spec.ready).toBe(false);
    expect(m.availability.testHealth.ready).toBe(false);
    expect(m.healthScore).toBe(0);
  });

  it("buildMetricAvailability lists spec blocker when no features dir", () => {
    const core = {
      specCompleteness: 0,
      testTraceability: 0,
      testHealth: null,
      testFreshnessDays: null,
      features: [],
      healthScore: 0,
      lastUpdated: new Date().toISOString()
    };
    const a = buildMetricAvailability(core, {
      featuresDirExists: false,
      playwrightResultsFound: false
    });
    expect(a.spec.blockedBy).toContain(".vindicate/stories/");
    expect(a.trace.ready).toBe(false);
  });

  it("attachMetricAvailability produces full DashboardMetrics", () => {
    const m = attachMetricAvailability(
      {
        specCompleteness: 100,
        testTraceability: 100,
        testHealth: { passed: 2, failed: 0, total: 2 },
        testFreshnessDays: 0,
        features: [{ name: "auth", specStatus: "complete", hasTests: true }],
        healthScore: 95,
        lastUpdated: new Date().toISOString()
      },
      { featuresDirExists: true, playwrightResultsFound: true }
    );
    expect(m.availability.spec.ready).toBe(true);
    expect(m.availability.testHealth.ready).toBe(true);
  });
});

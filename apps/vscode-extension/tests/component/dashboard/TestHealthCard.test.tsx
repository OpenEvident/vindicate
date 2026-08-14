import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HealthHero } from "../../../src/webview/components/dashboard/HealthHero";
import { createEmptyDashboardMetrics } from "../../../src/shared/metricAvailability";

describe("HealthHero", () => {
  it("renders health summary text", () => {
    const metrics = createEmptyDashboardMetrics();
    render(<HealthHero metrics={metrics} />);
    expect(screen.getByText(/Overall health/i)).toBeInTheDocument();
    expect(screen.getByText(/On track/i)).toBeInTheDocument();
  });

  it("shows pass/fail counts from metrics", () => {
    const metrics = createEmptyDashboardMetrics();
    metrics.tests.total = 24;
    metrics.tests.passed = 18;
    metrics.tests.failed = 6;
    render(<HealthHero metrics={metrics} />);
    expect(screen.getByText(/18 of 24 tests passing · 6 failing/i)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyDashboardMetrics } from "../../../src/shared/metricAvailability";
import { SpecsTab } from "../../../src/webview/components/dashboard/tabs/SpecsTab";

describe("Stories tab", () => {
  it("renders traceability warnings when present", () => {
    const metrics = createEmptyDashboardMetrics();
    metrics.storyWarnings = [
      {
        kind: "missing-spec-header",
        severity: "warn",
        file: "tests/search.spec.ts",
        line: 1,
        feature: null,
        title: "Missing // spec header",
        detail: "Add // spec comment."
      }
    ];

    render(<SpecsTab metrics={metrics} />);
    expect(screen.getByText(/Traceability warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing \/\/ spec header/i)).toBeInTheDocument();
    expect(screen.getByText(/tests\/search\.spec\.ts/i)).toBeInTheDocument();
  });
});

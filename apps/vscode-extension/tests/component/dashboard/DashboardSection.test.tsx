import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardView } from "../../../src/webview/components/dashboard/DashboardView";
import { useDashboardStore } from "../../../src/webview/stores/dashboardStore";
import { useOnboardingStore } from "../../../src/webview/stores/onboardingStore";
import { createEmptyDashboardMetrics } from "../../../src/shared/metricAvailability";

describe("DashboardView", () => {
  it("renders overview header by default", () => {
    useDashboardStore.setState({ metrics: null, isLoading: false, error: null });
    useOnboardingStore.setState({ folderName: "demo", mode: "build" });
    render(<DashboardView />);
    expect(screen.getByText("Project overview")).toBeInTheDocument();
    expect(screen.getByText("Feature matrix")).toBeInTheDocument();
  });

  it("renders tab labels with counts", () => {
    const metrics = createEmptyDashboardMetrics();
    useDashboardStore.setState({ metrics, isLoading: true, error: null });
    useOnboardingStore.setState({ folderName: "demo", mode: "build" });
    render(<DashboardView />);
    expect(screen.getByRole("button", { name: /Features/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stories/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Syncing\.\.\./i })).toBeDisabled();
  });
});

import { useMemo, useState } from "react";
import { createEmptyDashboardMetrics } from "../../../shared/metricAvailability";
import { McpEnableCallout } from "../shared/McpEnableCallout";
import { isDashboardMcpBannerHidden, setDashboardMcpBannerHidden } from "../../lib/mcpBannerPrefs";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useOnboardingStore } from "../../stores/onboardingStore";
import { CanvasHeader, type DashboardTabId } from "./CanvasHeader";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { SpecsTab } from "./tabs/SpecsTab";

export function DashboardView() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("overview");
  const folderPath = useOnboardingStore((s) => s.folderPath);
  const [dismissedFolder, setDismissedFolder] = useState<string | null>(null);
  const mcpBannerHidden = dismissedFolder === folderPath || isDashboardMcpBannerHidden(folderPath);
  const storedMetrics = useDashboardStore((s) => s.metrics);
  const isLoading = useDashboardStore((s) => s.isLoading);
  const folderName = useOnboardingStore((s) => s.folderName);
  const mode = useOnboardingStore((s) => s.mode);

  const metrics = useMemo(() => {
    const fallback = createEmptyDashboardMetrics();
    if (!storedMetrics) return fallback;
    return {
      ...fallback,
      ...storedMetrics,
      health: { ...fallback.health, ...(storedMetrics.health ?? {}) },
      tests: { ...fallback.tests, ...(storedMetrics.tests ?? {}) },
      specSchema: { ...fallback.specSchema, ...(storedMetrics.specSchema ?? {}) },
      acCoverage: { ...fallback.acCoverage, ...(storedMetrics.acCoverage ?? {}) },
      runs: storedMetrics.runs ?? fallback.runs,
      slowestTests: storedMetrics.slowestTests ?? fallback.slowestTests
    };
  }, [storedMetrics]);
  const project = folderName ?? metrics.project;

  return (
    <section className="vindicate-screen-dashboard">
      <div className="vindicate-ph-divider" />
      <CanvasHeader
        project={project}
        mode={(mode ?? metrics.mode).toUpperCase()}
        branch={metrics.branch}
        lastRunAt={metrics.tests.lastRunAt}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{
          features: metrics.features.length,
          specs: metrics.features.filter((feature) => feature.specStatus !== "missing").length
        }}
        isSyncing={isLoading}
      />
      {!mcpBannerHidden && (
        <McpEnableCallout
          title="Enable Vindicate MCP in your agent"
          attention
          dismissible
          onDismiss={() => {
            setDashboardMcpBannerHidden(folderPath, true);
            setDismissedFolder(folderPath);
          }}
        />
      )}
      {activeTab === "overview" && <OverviewTab metrics={metrics} />}
      {activeTab === "features" && <FeaturesTab metrics={metrics} />}
      {activeTab === "specs" && <SpecsTab metrics={metrics} />}
    </section>
  );
}

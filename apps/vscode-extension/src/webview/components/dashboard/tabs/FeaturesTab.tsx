import type { DashboardMetrics } from "../../../../shared/types";
import { FeatureMatrix } from "../FeatureMatrix";
import { KPICard } from "../KPICard";

export function FeaturesTab({ metrics }: { metrics: DashboardMetrics }) {
  const totalAC = metrics.features.reduce((sum, feature) => sum + feature.ac, 0);
  const totalTests = metrics.features.reduce((sum, feature) => sum + feature.linkedTests, 0);
  const totalPass = metrics.features.reduce((sum, feature) => sum + feature.tests.passed, 0);
  const totalRunTests = metrics.features.reduce((sum, feature) => sum + feature.tests.total, 0);
  const rolledUp = totalRunTests > 0 ? Math.round((totalPass / totalRunTests) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Features" value={metrics.features.length} sub="Defined in domain.md" />
        <KPICard
          label="Acceptance criteria"
          value={totalAC}
          sub={`${metrics.acCoverage.covered} traced, ${metrics.acCoverage.missing} missing`}
        />
        <KPICard
          label="Tests linked"
          value={totalTests}
          sub={`Across ${metrics.features.filter((feature) => feature.linkedTests > 0).length} features`}
        />
        <KPICard
          label="Pass rate (rolled-up)"
          value={rolledUp}
          unit="%"
          sub={`${totalPass}/${totalRunTests} passing`}
        />
      </div>
      <FeatureMatrix features={metrics.features} />
    </div>
  );
}

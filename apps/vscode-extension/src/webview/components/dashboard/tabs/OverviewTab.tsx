import type { DashboardMetrics } from "../../../../shared/types";
import { ACBreakdown } from "../ACBreakdown";
import { AlertsList } from "../AlertsList";
import { EmptyDashboardBanner } from "../EmptyDashboardBanner";
import { FailingTestsCard } from "../FailingTestsCard";
import { FeatureMatrix } from "../FeatureMatrix";
import { HealthHero } from "../HealthHero";
import { KPICard } from "../KPICard";

function formatDelta(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return undefined;
  return `${value > 0 ? "+" : "-"}${Math.abs(value)}`;
}

export function OverviewTab({ metrics }: { metrics: DashboardMetrics }) {
  const isEmpty = metrics.features.length === 0;

  const specDelta = formatDelta(metrics.health.spec.delta);
  const traceDelta = formatDelta(metrics.health.trace.delta);
  const passDelta = formatDelta(metrics.health.pass.delta);
  const freshDelta = formatDelta(metrics.health.fresh.delta);

  return (
    <div className="flex flex-col gap-[22px]">
      {isEmpty && <EmptyDashboardBanner />}
      <div className="grid grid-cols-[1fr,1.6fr] gap-4">
        <HealthHero metrics={metrics} />
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            label="Spec completeness"
            value={metrics.health.spec.value}
            unit="%"
            sub={metrics.health.spec.blurb}
            weight={metrics.health.spec.weight}
            tone="green"
            {...(specDelta !== undefined && { delta: specDelta })}
          />
          <KPICard
            label="Traceability"
            value={metrics.health.trace.value}
            unit="%"
            sub={metrics.health.trace.blurb}
            weight={metrics.health.trace.weight}
            tone="green"
            {...(traceDelta !== undefined && { delta: traceDelta })}
          />
          <KPICard
            label="Pass rate"
            value={metrics.health.pass.value}
            unit="%"
            sub={metrics.health.pass.blurb}
            weight={metrics.health.pass.weight}
            tone="green"
            {...(passDelta !== undefined && { delta: passDelta })}
          />
          <KPICard
            label="Freshness"
            value={metrics.health.fresh.value}
            unit="%"
            sub={metrics.health.fresh.blurb}
            weight={metrics.health.fresh.weight}
            tone="flat"
            {...(freshDelta !== undefined && { delta: freshDelta })}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1.4fr,1fr] gap-4">
        <AlertsList alerts={metrics.alerts} />
        <FailingTestsCard failures={metrics.failures} />
      </div>
      <FeatureMatrix features={metrics.features} />
      <ACBreakdown coverage={metrics.acCoverage} />
    </div>
  );
}

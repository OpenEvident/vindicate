import type { DashboardMetrics } from "../../../shared/types";
import { HealthRing } from "../shared/HealthRing";
import { MetricTip } from "../shared/MetricTip";

export function HealthHero({ metrics }: { metrics: DashboardMetrics }) {
  const delta = metrics.health.delta;
  const hasDelta = delta !== 0;
  return (
    <section className="health-hero">
      <div className="health-ring-wrap">
        <HealthRing score={metrics.health.overall} />
        <div className="health-ring-center">
          <div className="health-ring-num">
            {metrics.health.overall}
            <span className="unit">/100</span>
          </div>
          <div className="health-ring-grade">grade · {metrics.health.grade}</div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mb-1 inline-flex items-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--vs-text-dim)]">
          Overall health
          <MetricTip
            title="Overall health score"
            formula="0.4 × spec + 0.3 × trace + 0.2 × passRate + 0.1 × freshness"
            source="Computed on every refresh"
          />
        </div>
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--vs-text)]">
          On track.{" "}
          {hasDelta ? (
            <>
              <span className={delta >= 0 ? "text-[var(--ord-emerald)]" : "text-[var(--ord-red)]"}>
                {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}
                {Math.abs(delta)}
              </span>{" "}
              since last run.
            </>
          ) : (
            <span className="text-[var(--vs-text-dim)]">no change since last run.</span>
          )}
        </h3>
        <p className="mt-1 text-xs leading-[1.55] text-[var(--vs-text-dim)]">
          {metrics.tests.passed} of {metrics.tests.total} tests passing · {metrics.tests.failed} failing · ran{" "}
          {metrics.tests.lastRunAt}.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="run-pill pass">✓ {metrics.tests.passed} passed</span>
          <span className="run-pill fail">✗ {metrics.tests.failed} failed</span>
          {metrics.tests.skipped > 0 && <span className="run-pill skip">↷ {metrics.tests.skipped} skipped</span>}
          {metrics.tests.flaky > 0 && <span className="run-pill flak">⚡ {metrics.tests.flaky} flaky</span>}
          <span className="run-pill">{metrics.tests.durationLabel}</span>
        </div>
      </div>
    </section>
  );
}

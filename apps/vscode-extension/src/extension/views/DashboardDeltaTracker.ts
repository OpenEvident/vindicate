import type * as vscode from "vscode";
import type { DashboardMetrics } from "../shared/types";

interface MetricsSnapshot {
  healthOverall: number;
  spec: number;
  trace: number;
  pass: number;
  fresh: number;
}

const SNAPSHOT_KEY = "vindicate.dashboard.metricSnapshot.v1";

export class DashboardDeltaTracker {
  constructor(private readonly context: vscode.ExtensionContext) {}

  apply(metrics: DashboardMetrics): DashboardMetrics {
    const previous = this.context.workspaceState.get<MetricsSnapshot | null>(SNAPSHOT_KEY, null);
    const current = toSnapshot(metrics);

    const specDelta = previous ? current.spec - previous.spec : 0;
    const traceDelta = previous ? current.trace - previous.trace : 0;
    const passDelta = previous ? current.pass - previous.pass : 0;
    const freshDelta = previous ? current.fresh - previous.fresh : 0;
    const overallDelta = previous ? current.healthOverall - previous.healthOverall : 0;

    const next: DashboardMetrics = {
      ...metrics,
      healthDelta: overallDelta,
      health: {
        ...metrics.health,
        delta: overallDelta,
        spec: { ...metrics.health.spec, delta: specDelta },
        trace: { ...metrics.health.trace, delta: traceDelta },
        pass: { ...metrics.health.pass, delta: passDelta },
        fresh: { ...metrics.health.fresh, delta: freshDelta }
      }
    };

    void this.context.workspaceState.update(SNAPSHOT_KEY, current);
    return next;
  }
}

function toSnapshot(metrics: DashboardMetrics): MetricsSnapshot {
  return {
    healthOverall: metrics.health.overall,
    spec: metrics.health.spec.value,
    trace: metrics.health.trace.value,
    pass: metrics.health.pass.value,
    fresh: metrics.health.fresh.value
  };
}

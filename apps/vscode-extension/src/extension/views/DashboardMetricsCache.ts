import type { DashboardMetrics } from "../shared/types";

export class DashboardMetricsCache {
  private last: DashboardMetrics | null = null;

  get(): DashboardMetrics | null {
    return this.last;
  }

  set(metrics: DashboardMetrics): void {
    this.last = metrics;
  }

  clear(): void {
    this.last = null;
  }
}

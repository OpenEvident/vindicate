import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardMetrics } from "../../../src/shared/metricAvailability";
import { DashboardDeltaTracker } from "../../../src/extension/views/DashboardDeltaTracker";

function mockContext() {
  const storage = new Map<string, unknown>();
  return {
    workspaceState: {
      get: <T>(key: string, defaultValue?: T): T => {
        return (storage.has(key) ? (storage.get(key) as T) : (defaultValue as T));
      },
      update: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value);
      })
    }
  } as unknown as { workspaceState: { get: <T>(key: string, defaultValue?: T) => T; update: (key: string, value: unknown) => Promise<void> } };
}

describe("DashboardDeltaTracker", () => {
  it("returns zero deltas on first snapshot", () => {
    const context = mockContext();
    const tracker = new DashboardDeltaTracker(context as never);
    const metrics = createEmptyDashboardMetrics();
    metrics.health.overall = 70;
    metrics.health.spec.value = 80;
    metrics.health.trace.value = 60;
    metrics.health.pass.value = 75;
    metrics.health.fresh.value = 65;

    const first = tracker.apply(metrics);
    expect(first.health.delta).toBe(0);
    expect(first.health.spec.delta).toBe(0);
    expect(first.health.trace.delta).toBe(0);
    expect(first.health.pass.delta).toBe(0);
    expect(first.health.fresh.delta).toBe(0);
  });

  it("computes deltas from previous snapshot", () => {
    const context = mockContext();
    const tracker = new DashboardDeltaTracker(context as never);

    const baseline = createEmptyDashboardMetrics();
    baseline.health.overall = 70;
    baseline.health.spec.value = 80;
    baseline.health.trace.value = 60;
    baseline.health.pass.value = 75;
    baseline.health.fresh.value = 65;
    tracker.apply(baseline);

    const next = createEmptyDashboardMetrics();
    next.health.overall = 76;
    next.health.spec.value = 85;
    next.health.trace.value = 58;
    next.health.pass.value = 78;
    next.health.fresh.value = 62;
    const withDelta = tracker.apply(next);

    expect(withDelta.health.delta).toBe(6);
    expect(withDelta.health.spec.delta).toBe(5);
    expect(withDelta.health.trace.delta).toBe(-2);
    expect(withDelta.health.pass.delta).toBe(3);
    expect(withDelta.health.fresh.delta).toBe(-3);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  computeGovernorState,
  ResourceGovernor,
  type GovernorThresholds,
  type ISystemSampler
} from "./resource-governor.js";

const thresholds: GovernorThresholds = {
  VINDICATE_MAX_CPU_PCT: 80,
  VINDICATE_MAX_MEMORY_PCT: 75,
  VINDICATE_REJECT_CPU_PCT: 95,
  VINDICATE_REJECT_MEMORY_PCT: 90
};

describe("computeGovernorState", () => {
  it("returns normal when both metrics are below warning", () => {
    expect(computeGovernorState(10, 10, thresholds)).toBe("normal");
    expect(computeGovernorState(79.9, 74.9, thresholds)).toBe("normal");
  });

  it("enters warning when CPU crosses max", () => {
    expect(computeGovernorState(80, 10, thresholds)).toBe("warning");
    expect(computeGovernorState(94, 10, thresholds)).toBe("warning");
  });

  it("enters warning when memory crosses max", () => {
    expect(computeGovernorState(10, 75, thresholds)).toBe("warning");
    expect(computeGovernorState(10, 89, thresholds)).toBe("warning");
  });

  it("enters reject when either metric crosses reject threshold", () => {
    expect(computeGovernorState(95, 10, thresholds)).toBe("reject");
    expect(computeGovernorState(10, 90, thresholds)).toBe("reject");
    expect(computeGovernorState(100, 100, thresholds)).toBe("reject");
  });

  it("reject wins over warning when both apply", () => {
    expect(computeGovernorState(95, 90, thresholds)).toBe("reject");
  });

  it("stays in warning until metrics drop below clear margin", () => {
    expect(computeGovernorState(79, 50, thresholds, "warning")).toBe("warning");
    expect(computeGovernorState(74, 50, thresholds, "warning")).toBe("normal");
  });

  it("stays in reject until metrics drop below reject clear margin", () => {
    expect(computeGovernorState(93, 50, thresholds, "reject")).toBe("reject");
    expect(computeGovernorState(91, 50, thresholds, "reject")).toBe("warning");
    expect(computeGovernorState(74, 50, thresholds, "reject")).toBe("normal");
  });
});

describe("ResourceGovernor", () => {
  it("notifies subscribers when sampled state changes", async () => {
    const sampler: ISystemSampler = {
      sample: vi
        .fn()
        .mockResolvedValueOnce({ cpuPct: 50, memUsedPct: 50 })
        .mockResolvedValueOnce({ cpuPct: 85, memUsedPct: 50 })
        .mockResolvedValue({ cpuPct: 79, memUsedPct: 50 })
    };
    const gov = new ResourceGovernor(thresholds, sampler);
    const states: string[] = [];
    gov.onStateChange((s) => {
      states.push(s);
    });
    await gov.sampleNow();
    await gov.sampleNow();
    await gov.sampleNow();
    expect(states).toEqual(["warning"]);
  });
});

/**
 * @file Machine-oriented CPU/memory sampling with hysteresis on state exit (ARCHITECTURE §9.2).
 */
import os from "node:os";

import type { Logger } from "@vindicate/observability";
import pidusage from "pidusage";

import type { Config } from "../config.js";
import type { GovernorState, IResourceGovernor } from "./resource-governor.interface.js";

export type GovernorThresholds = Pick<
  Config,
  "VINDICATE_MAX_CPU_PCT" | "VINDICATE_MAX_MEMORY_PCT" | "VINDICATE_REJECT_CPU_PCT" | "VINDICATE_REJECT_MEMORY_PCT"
>;

/** Samples instantaneous CPU% (process) and system memory utilisation %. */
export interface ISystemSampler {
  sample(): Promise<{ cpuPct: number; memUsedPct: number }>;
}

const WARN_CLEAR_MARGIN_PCT = 5;
const REJECT_CLEAR_MARGIN_PCT = 3;

export function computeGovernorState(
  cpuPct: number,
  memUsedPct: number,
  thresholds: GovernorThresholds,
  current: GovernorState = "normal"
): GovernorState {
  const rejectEnter =
    cpuPct >= thresholds.VINDICATE_REJECT_CPU_PCT ||
    memUsedPct >= thresholds.VINDICATE_REJECT_MEMORY_PCT;
  const rejectExit =
    cpuPct < thresholds.VINDICATE_REJECT_CPU_PCT - REJECT_CLEAR_MARGIN_PCT &&
    memUsedPct < thresholds.VINDICATE_REJECT_MEMORY_PCT - REJECT_CLEAR_MARGIN_PCT;
  const warnEnter =
    cpuPct >= thresholds.VINDICATE_MAX_CPU_PCT ||
    memUsedPct >= thresholds.VINDICATE_MAX_MEMORY_PCT;
  const warnExit =
    cpuPct < thresholds.VINDICATE_MAX_CPU_PCT - WARN_CLEAR_MARGIN_PCT &&
    memUsedPct < thresholds.VINDICATE_MAX_MEMORY_PCT - WARN_CLEAR_MARGIN_PCT;

  if (current === "reject") {
    if (!rejectExit) {
      return "reject";
    }
    if (rejectEnter) {
      return "reject";
    }
    return warnEnter ? "warning" : "normal";
  }

  if (current === "warning") {
    if (rejectEnter) {
      return "reject";
    }
    if (!warnExit) {
      return "warning";
    }
    return "normal";
  }

  if (rejectEnter) {
    return "reject";
  }
  if (warnEnter) {
    return "warning";
  }
  return "normal";
}

export class PidusageSystemSampler implements ISystemSampler {
  async sample(): Promise<{ cpuPct: number; memUsedPct: number }> {
    const stats = await pidusage(process.pid);
    const total = os.totalmem();
    const used = total - os.freemem();
    const memUsedPct = total > 0 ? (used / total) * 100 : 0;
    const cpuPct = typeof stats.cpu === "number" ? stats.cpu : 0;
    return { cpuPct, memUsedPct };
  }
}

export interface ResourceGovernorOptions {
  readonly sampleMs?: number;
  readonly logger?: Logger;
}

export class ResourceGovernor implements IResourceGovernor {
  private _state: GovernorState = "normal";
  private readonly listeners = new Set<(state: GovernorState) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly thresholds: GovernorThresholds,
    private readonly sampler: ISystemSampler,
    private readonly options?: ResourceGovernorOptions
  ) {}

  get state(): GovernorState {
    return this._state;
  }

  onStateChange(callback: (state: GovernorState) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  start(): void {
    if (this.timer !== undefined) {
      return;
    }
    const ms = this.options?.sampleMs ?? 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, ms);
    void this.tick();
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Runs one sampling cycle (used by tests; safe to call while the interval is running). */
  async sampleNow(): Promise<void> {
    await this.tick();
  }

  private emit(next: GovernorState): void {
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private async tick(): Promise<void> {
    try {
      const { cpuPct, memUsedPct } = await this.sampler.sample();
      const next = computeGovernorState(cpuPct, memUsedPct, this.thresholds, this._state);
      if (next !== this._state) {
        this._state = next;
        this.emit(next);
        this.options?.logger?.debug(
          { governorState: next, cpuPct, memUsedPct },
          "resource governor state changed"
        );
      }
    } catch (err: unknown) {
      this.options?.logger?.warn({ err }, "resource governor sample failed");
    }
  }
}

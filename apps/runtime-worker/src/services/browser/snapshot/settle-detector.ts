/**
 * @file Network-idle-only settle after mutating actions.
 */
import type { Page } from "playwright-core";

export interface SettleConfigSlice {
  readonly VINDICATE_SETTLE_NETWORK_MS: number;
  readonly VINDICATE_SETTLE_TIMEOUT_MS: number;
}

export interface SettleOutcome {
  readonly timedOut: boolean;
}

export async function runSettle(page: Page, cfg: SettleConfigSlice): Promise<SettleOutcome> {
  const t0 = Date.now();
  const budget = cfg.VINDICATE_SETTLE_TIMEOUT_MS;
  const netCap = Math.min(cfg.VINDICATE_SETTLE_NETWORK_MS, budget);
  let timedOut = false;
  if (netCap > 0) {
    await page.waitForLoadState("networkidle", { timeout: netCap }).catch(() => {
      timedOut = true;
    });
  }
  if (!timedOut) {
    timedOut = Date.now() - t0 >= budget;
  }
  return { timedOut };
}

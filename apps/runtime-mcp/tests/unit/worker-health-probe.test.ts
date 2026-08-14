import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startWorkerHealthProbe } from "../../src/worker/worker-health-probe.js";

describe("startWorkerHealthProbe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("probes immediately and marks ready when health is ok", async () => {
    const health = vi.fn(async () => ({ ok: true }));
    const markWorkerReady = vi.fn();
    startWorkerHealthProbe({ health, markWorkerReady }, 5_000);
    await vi.waitFor(() => {
      expect(health).toHaveBeenCalled();
    });
    expect(markWorkerReady).toHaveBeenCalled();
  });

  it("does not mark ready when health returns not ok", async () => {
    const health = vi.fn(async () => ({ ok: false }));
    const markWorkerReady = vi.fn();
    startWorkerHealthProbe({ health, markWorkerReady }, 5_000);
    await vi.waitFor(() => {
      expect(health).toHaveBeenCalled();
    });
    expect(markWorkerReady).not.toHaveBeenCalled();
  });

  it("swallows probe errors and retries on interval", async () => {
    const health = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("down"))
      .mockResolvedValueOnce({ ok: true });
    const markWorkerReady = vi.fn();
    const stop = startWorkerHealthProbe({ health, markWorkerReady }, 1_000);
    await vi.waitFor(() => {
      expect(health).toHaveBeenCalledTimes(1);
    });
    expect(markWorkerReady).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => {
      expect(markWorkerReady).toHaveBeenCalled();
    });
    stop();
  });

  it("stop clears the interval", async () => {
    const health = vi.fn(async () => ({ ok: false }));
    const stop = startWorkerHealthProbe({ health, markWorkerReady: vi.fn() }, 500);
    await vi.waitFor(() => {
      expect(health).toHaveBeenCalledTimes(1);
    });
    stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(health).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthPingService } from "../../../src/extension/health/HealthPingService";

describe("HealthPingService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'up' when fetch succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const broadcaster = { broadcast: vi.fn() };
    const service = new HealthPingService(broadcaster, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn()
    });
    service.start();
    await vi.runOnlyPendingTimersAsync();
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "health:status", runtime: "up", mcp: "up" })
    );
    service.dispose();
    vi.unstubAllGlobals();
  });

  it("dispose clears ping interval without further broadcasts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const broadcaster = { broadcast: vi.fn() };
    const service = new HealthPingService(broadcaster, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn()
    });
    service.start();
    await vi.runOnlyPendingTimersAsync();
    const afterStart = broadcaster.broadcast.mock.calls.length;
    service.dispose();
    const afterDispose = broadcaster.broadcast.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(afterDispose).toBe(afterStart);
    expect(broadcaster.broadcast.mock.calls.length).toBe(afterDispose);
    vi.unstubAllGlobals();
  });

  it("stop preserves last-known health without broadcasting reset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const broadcaster = { broadcast: vi.fn() };
    const service = new HealthPingService(broadcaster, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn()
    });

    service.start();
    await vi.runOnlyPendingTimersAsync();
    const healthBeforeStop = service.getHealth();
    const callsBeforeStop = broadcaster.broadcast.mock.calls.length;
    service.stop();

    expect(broadcaster.broadcast.mock.calls.length).toBe(callsBeforeStop);
    expect(service.getHealth()).toEqual(healthBeforeStop);
    service.dispose();
    vi.unstubAllGlobals();
  });

  it("returns 'down' when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));
    const broadcaster = { broadcast: vi.fn() };
    const service = new HealthPingService(broadcaster, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn()
    });
    service.start();
    await vi.runOnlyPendingTimersAsync();
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "health:status", runtime: "down", mcp: "down" })
    );
    service.dispose();
    vi.unstubAllGlobals();
  });
});

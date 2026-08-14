import type { Logger } from "@vindicate/observability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startIdleShutdownMonitor } from "./idle-shutdown.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn()
} as unknown as Logger;

describe("startIdleShutdownMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shuts down once idle beyond the timeout with zero active sessions", () => {
    const onIdleTimeout = vi.fn();
    const monitor = startIdleShutdownMonitor({
      idleTimeoutMs: 1_000,
      checkIntervalMs: 100,
      getActiveSessionCount: () => 0,
      onIdleTimeout,
      logger
    });

    vi.advanceTimersByTime(1_100);

    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it("does not shut down while there are active or paused sessions", () => {
    const onIdleTimeout = vi.fn();
    startIdleShutdownMonitor({
      idleTimeoutMs: 1_000,
      checkIntervalMs: 100,
      getActiveSessionCount: () => 1,
      onIdleTimeout,
      logger
    });

    vi.advanceTimersByTime(5_000);

    expect(onIdleTimeout).not.toHaveBeenCalled();
  });

  it("resets the idle clock when noteActivity is called", () => {
    const onIdleTimeout = vi.fn();
    const monitor = startIdleShutdownMonitor({
      idleTimeoutMs: 1_000,
      checkIntervalMs: 100,
      getActiveSessionCount: () => 0,
      onIdleTimeout,
      logger
    });

    vi.advanceTimersByTime(900);
    monitor.noteActivity();
    vi.advanceTimersByTime(900);

    expect(onIdleTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onIdleTimeout).toHaveBeenCalledTimes(1);
  });

  it("stop() prevents any further shutdown check", () => {
    const onIdleTimeout = vi.fn();
    const monitor = startIdleShutdownMonitor({
      idleTimeoutMs: 1_000,
      checkIntervalMs: 100,
      getActiveSessionCount: () => 0,
      onIdleTimeout,
      logger
    });

    monitor.stop();
    vi.advanceTimersByTime(5_000);

    expect(onIdleTimeout).not.toHaveBeenCalled();
  });
});

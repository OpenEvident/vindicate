/**
 * @file Idle self-shutdown — the worker is a machine-wide singleton shared by
 * every editor window, so nothing else tells it to stop when the last editor
 * closes. It reaps itself once no editor has pinged /health for
 * VINDICATE_IDLE_SHUTDOWN_MS and there are zero active/paused browser sessions
 * (the session-count guard prevents reaping a worker mid-recording just
 * because pings happened to lull).
 */
import type { Logger } from "@vindicate/observability";

export interface IdleShutdownDeps {
  readonly idleTimeoutMs: number;
  readonly checkIntervalMs?: number;
  readonly getActiveSessionCount: () => number;
  readonly onIdleTimeout: () => void;
  readonly logger: Logger;
}

export interface IdleShutdownMonitor {
  /** Call on every /health hit — the signal that some editor is still alive. */
  readonly noteActivity: () => void;
  readonly stop: () => void;
}

export function startIdleShutdownMonitor(deps: IdleShutdownDeps): IdleShutdownMonitor {
  let lastActivityAt = Date.now();
  const checkIntervalMs = deps.checkIntervalMs ?? Math.min(deps.idleTimeoutMs / 5, 60_000);

  const timer = setInterval(() => {
    const idleForMs = Date.now() - lastActivityAt;
    if (idleForMs < deps.idleTimeoutMs) {
      return;
    }
    const activeSessionCount = deps.getActiveSessionCount();
    if (activeSessionCount > 0) {
      return;
    }
    deps.logger.info(
      { idleForMs },
      "runtime-worker idle with no active sessions — self-shutting-down"
    );
    clearInterval(timer);
    deps.onIdleTimeout();
  }, checkIntervalMs);
  timer.unref();

  return {
    noteActivity: () => {
      lastActivityAt = Date.now();
    },
    stop: () => {
      clearInterval(timer);
    }
  };
}

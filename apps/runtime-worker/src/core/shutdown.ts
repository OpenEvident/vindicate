/**
 * @file Graceful worker shutdown — drain queues, close browsers, persist sessions.
 */
import type { IBrowserBridge } from "../infrastructure/browser/browser-bridge.interface.js";
import type { IResourceGovernor } from "./governor/resource-governor.interface.js";
import type { BrowserQueueManager } from "../services/browser/queue/browser.queue.js";
import type { ISessionStore } from "../services/browser/session/session.store.interface.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDeps {
  readonly queues: BrowserQueueManager;
  readonly bridge: IBrowserBridge;
  readonly store: ISessionStore;
  readonly governor: IResourceGovernor;
  readonly closeApp: () => Promise<void>;
  readonly stopSessionCleanup: () => void;
}

let shuttingDown = false;
let shutdownRunner: ((deps: ShutdownDeps) => Promise<void>) | undefined;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Test seam — replaces default shutdown (which calls process.exit). */
export function setShutdownRunnerForTests(
  runner: ((deps: ShutdownDeps) => Promise<void>) | undefined
): void {
  shutdownRunner = runner;
}

async function runDefaultShutdown(deps: ShutdownDeps): Promise<void> {
  const forceTimer = setTimeout(() => {
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await deps.queues.drainAll(SHUTDOWN_TIMEOUT_MS - 500);
    await deps.bridge.closeAll();
    await deps.store.flush();
    deps.stopSessionCleanup();
    deps.governor.stop();
    await deps.closeApp();
    clearTimeout(forceTimer);
    process.exit(0);
  } catch {
    clearTimeout(forceTimer);
    process.exit(1);
  }
}

export function requestGracefulShutdown(deps: ShutdownDeps): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  void (shutdownRunner ?? runDefaultShutdown)(deps);
}

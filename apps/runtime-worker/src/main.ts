/**
 * @file Composition root — the only module that wires concrete infrastructure to the HTTP server.
 */
import { config } from "./core/config.js";
import { EventBus } from "./core/events/event-bus.js";
import { PidusageSystemSampler, ResourceGovernor } from "./core/governor/resource-governor.js";
import { startIdleShutdownMonitor } from "./core/idle-shutdown.js";
import { logger } from "./core/logger.js";
import { buildServer } from "./core/server.js";
import { requestGracefulShutdown } from "./core/shutdown.js";
import { KeyringSessionCrypto, PlaintextSessionCrypto } from "./infrastructure/crypto/session-crypto.js";
import { SessionDiskStore } from "./infrastructure/persistence/session-disk-store.js";
import { PlaywrightBridge } from "./infrastructure/browser/playwright-bridge.js";
import { HighlightService } from "./services/browser/highlight/highlight-service.js";
import { BrowserQueueManager } from "./services/browser/queue/browser.queue.js";
import { BrowserSessionStore } from "./services/browser/session/session.store.js";
import { SessionActionLog } from "./services/browser/logs/action-log.js";
import { SessionLogRegistry } from "./services/browser/logs/session-log-registry.js";
import { SnapshotEngine } from "./services/browser/snapshot/snapshot-engine.js";
import { SnapshotMemoryTable } from "./services/browser/snapshot/snapshot-memory.js";
import { RecordingService } from "./services/browser/recording/recording.service.js";

async function main(): Promise<void> {
  const eventBus = new EventBus(config.VINDICATE_EVENTS_BUFFER_SIZE);

  const governor = new ResourceGovernor(
    {
      VINDICATE_MAX_CPU_PCT: config.VINDICATE_MAX_CPU_PCT,
      VINDICATE_MAX_MEMORY_PCT: config.VINDICATE_MAX_MEMORY_PCT,
      VINDICATE_REJECT_CPU_PCT: config.VINDICATE_REJECT_CPU_PCT,
      VINDICATE_REJECT_MEMORY_PCT: config.VINDICATE_REJECT_MEMORY_PCT
    },
    new PidusageSystemSampler(),
    { logger, sampleMs: 1000 }
  );
  governor.start();

  eventBus.publish({ event: "worker_health", governor_state: governor.state });

  let prevGovernorState = governor.state;
  governor.onStateChange((state) => {
    eventBus.publish({ event: "worker_health", governor_state: state });
    if (state === "reject" && prevGovernorState !== "reject") {
      eventBus.publish({
        event: "worker_throttled",
        reason: "resource_pressure",
        retry_after_ms: 2000
      });
    }
    prevGovernorState = state;
  });

  const sessionCrypto = config.VINDICATE_SESSION_ENCRYPT
    ? new KeyringSessionCrypto()
    : new PlaintextSessionCrypto();
  const sessionDisk = new SessionDiskStore(SessionDiskStore.defaultDir(), sessionCrypto, {
    encryptFilenames: config.VINDICATE_SESSION_ENCRYPT
  });
  const sessionStore = new BrowserSessionStore(sessionDisk, logger, config.VINDICATE_SESSION_TTL_HOURS);
  await sessionStore.initializeFromDisk();
  const workerReady = true;
  const stopSessionCleanup = sessionStore.startPeriodicCleanup(config.VINDICATE_SESSION_CLEANUP_INTERVAL_MS);

  const sessionLogs = new SessionLogRegistry({
    consoleBufferSize: config.VINDICATE_CONSOLE_BUFFER_SIZE,
    networkBufferSize: config.VINDICATE_NETWORK_BUFFER_SIZE
  });
  const actionLog = new SessionActionLog(config.VINDICATE_ACTION_LOG_SIZE);

  const highlightService = new HighlightService();
  const bridge = new PlaywrightBridge(logger, highlightService);
  const browserQueues = new BrowserQueueManager(governor);
  const snapshotMemory = new SnapshotMemoryTable(config.VINDICATE_DELTA_CACHE_SIZE);
  const snapshotEngine = new SnapshotEngine(
    snapshotMemory,
    {
      VINDICATE_SNAPSHOT_MAX_NODES: config.VINDICATE_SNAPSHOT_MAX_NODES,
      VINDICATE_SNAPSHOT_MAX_HTML_BYTES: config.VINDICATE_SNAPSHOT_MAX_HTML_BYTES,
      VINDICATE_MAX_OUTPUT_CHARS: config.VINDICATE_MAX_OUTPUT_CHARS,
      VINDICATE_SNAPSHOT_DESCRIPTOR_CAP: config.VINDICATE_SNAPSHOT_DESCRIPTOR_CAP,
      VINDICATE_READ_SETTLE_MS: config.VINDICATE_READ_SETTLE_MS
    },
    (sessionId, snapshotId) => {
      sessionLogs.setSnapshotId(sessionId, snapshotId);
    }
  );
  const recordingService = new RecordingService(bridge, sessionStore, eventBus, logger, {
    VINDICATE_SETTLE_NETWORK_MS: config.VINDICATE_SETTLE_NETWORK_MS,
    VINDICATE_SETTLE_TIMEOUT_MS: config.VINDICATE_SETTLE_TIMEOUT_MS
  });

  bridge.onContextDead((sessionId, reason) => {
    void (async () => {
      try {
        recordingService.markReviewOnContextDead(sessionId);
        const rec = sessionStore.get(sessionId);
        if (rec !== undefined && (rec.status === "active" || rec.status === "paused")) {
          await sessionStore.applyTrigger(sessionId, "crash");
        }
      } catch (err: unknown) {
        logger.warn({ err, sessionId }, "onContextDead: session state update failed");
      }
      sessionLogs.drop(sessionId);
      actionLog.drop(sessionId);
      snapshotEngine.dropSession(sessionId);
      eventBus.publish({ event: "session_dead", session_id: sessionId, reason });
    })();
  });

  // eslint-disable-next-line prefer-const -- assigned after buildServer returns, referenced in closures below
  let app!: Awaited<ReturnType<typeof buildServer>>;

  const idleShutdown = startIdleShutdownMonitor({
    idleTimeoutMs: config.VINDICATE_IDLE_SHUTDOWN_MS,
    getActiveSessionCount: () => sessionStore.list().filter((s) => s.status !== "dead").length,
    onIdleTimeout: () =>
      requestGracefulShutdown({
        queues: browserQueues,
        bridge,
        store: sessionStore,
        governor,
        closeApp: () => app.close(),
        stopSessionCleanup
      }),
    logger
  });

  app = await buildServer({
    logger,
    eventBus,
    eventsBufferSize: config.VINDICATE_EVENTS_BUFFER_SIZE,
    lifecycle: {
      isReady: () => workerReady,
      sessionsDir: SessionDiskStore.defaultDir(),
      onHealthPing: idleShutdown.noteActivity,
      getShutdownDeps: () => ({
        queues: browserQueues,
        bridge,
        store: sessionStore,
        governor,
        closeApp: () => app.close(),
        stopSessionCleanup
      })
    },
    browser: {
      store: sessionStore,
      bridge,
      queues: browserQueues,
      governor,
      maxFileBytes: config.VINDICATE_MAX_FILE_BYTES,
      commandConfig: {
        VINDICATE_SETTLE_NETWORK_MS: config.VINDICATE_SETTLE_NETWORK_MS,
        VINDICATE_SETTLE_TIMEOUT_MS: config.VINDICATE_SETTLE_TIMEOUT_MS,
        VINDICATE_ACTION_TIMEOUT_MS: config.VINDICATE_ACTION_TIMEOUT_MS,
        VINDICATE_ACTION_TIMEOUT_MAX_MS: config.VINDICATE_ACTION_TIMEOUT_MAX_MS
      },
      snapshotEngine,
      highlightService,
      eventBus,
      sessionLogs,
      actionLog,
      recordingService
    }
  });
  app.addHook("onClose", () => {
    idleShutdown.stop();
    stopSessionCleanup();
    governor.stop();
    void bridge.closeAll().catch((err: unknown) => {
      logger.warn({ err }, "bridge.closeAll failed during shutdown");
    });
  });

  const address = await app.listen({
    host: "127.0.0.1",
    port: config.VINDICATE_WORKER_PORT
  });
  logger.info({ address }, "runtime-worker listening");
}

// The worker is a machine-shared daemon (one instance serves every editor
// window) and drives Playwright, which is known to emit stray rejections when
// a browser dies mid-action. Node's default kills the process on any unhandled
// rejection — taking every session on the machine with it. Log and keep
// serving; per-command failures are already reported to their callers.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ err: reason }, "unhandled promise rejection (continuing)");
});
process.on("uncaughtException", (err: unknown) => {
  logger.fatal({ err }, "uncaught exception — exiting");
  process.exit(1);
});

main().catch((err: unknown) => {
  logger.fatal({ err }, "runtime-worker failed to start");
  process.exitCode = 1;
});

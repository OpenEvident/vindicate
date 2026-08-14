/**
 * @file Shared harness for browser session HTTP integration tests.
 */
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVindicateLogger } from "@vindicate/observability";

import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import type { IBrowserBridge } from "../../src/infrastructure/browser/browser-bridge.interface.js";
import { PlaintextSessionCrypto } from "../../src/infrastructure/crypto/session-crypto.js";
import { SessionDiskStore } from "../../src/infrastructure/persistence/session-disk-store.js";
import { BrowserQueueManager } from "../../src/services/browser/queue/browser.queue.js";
import type { BrowserCommandConfigSlice } from "../../src/services/browser/routes/session.routes.js";
import { BrowserSessionStore } from "../../src/services/browser/session/session.store.js";
import { SessionActionLog } from "../../src/services/browser/logs/action-log.js";
import { SessionLogRegistry } from "../../src/services/browser/logs/session-log-registry.js";
import { HighlightService } from "../../src/services/browser/highlight/highlight-service.js";
import { SnapshotEngine } from "../../src/services/browser/snapshot/snapshot-engine.js";
import { SnapshotMemoryTable } from "../../src/services/browser/snapshot/snapshot-memory.js";
import { RecordingService } from "../../src/services/browser/recording/recording.service.js";
import { FakeBrowserBridge } from "../fakes/fake-browser-bridge.js";
import { FakeResourceGovernor } from "../fakes/fake-resource-governor.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";

export const testCommandConfig: BrowserCommandConfigSlice = {
  VINDICATE_SETTLE_NETWORK_MS: 5000,
  VINDICATE_SETTLE_TIMEOUT_MS: 10_000,
  VINDICATE_ACTION_TIMEOUT_MS: 30_000,
  VINDICATE_ACTION_TIMEOUT_MAX_MS: 120_000
};

export type BrowserTestApp = Awaited<ReturnType<typeof buildServer>>;

export interface BrowserSessionTestContext {
  readonly app: BrowserTestApp;
  readonly store: BrowserSessionStore;
  readonly bridge: FakeBrowserBridge;
  readonly governor: FakeResourceGovernor;
  readonly queues: BrowserQueueManager;
  readonly eventBus: EventBus;
  readonly sessionLogs: SessionLogRegistry;
  readonly snapshotEngine: SnapshotEngine;
  readonly dataDir: string;
}

export function parseSseDataLines(body: string): unknown[] {
  const events: unknown[] = [];
  const normalized = body.replace(/\r\n/g, "\n");
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      events.push(JSON.parse(trimmed.slice("data: ".length)) as unknown);
    }
  }
  return events;
}

export async function createBrowserSessionTestContext(): Promise<BrowserSessionTestContext> {
  const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
  const dataDir = path.join(os.tmpdir(), `vindicate-browser-int-${Date.now()}-${randomUUID()}`);
  await mkdir(dataDir, { recursive: true });
  const eventBus = new EventBus(50);
  const disk = new SessionDiskStore(dataDir, new PlaintextSessionCrypto(), { encryptFilenames: false });
  const store = new BrowserSessionStore(disk, logger, 24);
  await store.initializeFromDisk();
  const governor = new FakeResourceGovernor();
  const bridge = new FakeBrowserBridge();
  const queues = new BrowserQueueManager(governor);
  const sessionLogs = new SessionLogRegistry({ consoleBufferSize: 50, networkBufferSize: 50 });
  const actionLog = new SessionActionLog(100);
  const snapshotMemory = new SnapshotMemoryTable(5);
  const snapshotEngine = new SnapshotEngine(
    snapshotMemory,
    {
      VINDICATE_SNAPSHOT_MAX_NODES: 500,
      VINDICATE_SNAPSHOT_MAX_HTML_BYTES: 102_400,
      VINDICATE_MAX_OUTPUT_CHARS: 50_000
    },
    (sid, snapId) => {
      sessionLogs.setSnapshotId(sid, snapId);
    }
  );

  wireContextDeadHandlers(bridge, store, sessionLogs, actionLog, snapshotEngine, eventBus);

  const recordingService = new RecordingService(bridge, store, eventBus, logger);

  const app = await buildServer({
    logger,
    eventBus,
    eventsBufferSize: 50,
    lifecycle: {
      isReady: () => true,
      sessionsDir: dataDir,
      getShutdownDeps: () => ({
        queues,
        bridge,
        store,
        governor,
        closeApp: () => app.close(),
        stopSessionCleanup: () => undefined
      })
    },
    browser: {
      store,
      bridge,
      queues,
      governor,
      commandConfig: testCommandConfig,
      snapshotEngine,
      highlightService: new HighlightService(),
      eventBus,
      sessionLogs,
      actionLog,
      maxFileBytes: 1_048_576,
      recordingService
    }
  });

  return { app, store, bridge, governor, queues, eventBus, sessionLogs, snapshotEngine, dataDir };
}

export async function destroyBrowserSessionTestContext(ctx: BrowserSessionTestContext): Promise<void> {
  await ctx.app.close();
  await rm(ctx.dataDir, { recursive: true, force: true });
}

export interface AuthInjectOptions {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly payload?: unknown;
}

export function authInject(app: BrowserTestApp, options: AuthInjectOptions) {
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.payload,
    headers: { ...internalAuthHeaders(), ...options.headers }
  });
}

export async function createSession(
  ctx: BrowserSessionTestContext,
  name = "test"
): Promise<string> {
  const res = await authInject(ctx.app, {
    method: "POST",
    url: "/browser/sessions",
    payload: { name, url: "https://example.com/", project_root: ctx.dataDir }
  });
  if (res.statusCode !== 200) {
    throw new Error(`create session failed: ${String(res.statusCode)}`);
  }
  return (JSON.parse(res.body) as { session_id: string }).session_id;
}

function wireContextDeadHandlers(
  bridge: IBrowserBridge,
  store: BrowserSessionStore,
  sessionLogs: SessionLogRegistry,
  actionLog: SessionActionLog,
  snapshotEngine: SnapshotEngine,
  eventBus: EventBus
): void {
  bridge.onContextDead((sessionId, reason) => {
    void (async () => {
      const rec = store.get(sessionId);
      if (rec !== undefined && (rec.status === "active" || rec.status === "paused")) {
        await store.applyTrigger(sessionId, "crash");
      }
      sessionLogs.drop(sessionId);
      actionLog.drop(sessionId);
      snapshotEngine.dropSession(sessionId);
      eventBus.publish({ event: "session_dead", session_id: sessionId, reason });
    })();
  });
}

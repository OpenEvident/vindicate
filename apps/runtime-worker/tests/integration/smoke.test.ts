import { createVindicateLogger } from "@vindicate/observability";
import { RuntimeHealthResponseSchema } from "@vindicate/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { config } from "../../src/core/config.js";
import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { PlaintextSessionCrypto } from "../../src/infrastructure/crypto/session-crypto.js";
import { SessionDiskStore } from "../../src/infrastructure/persistence/session-disk-store.js";
import { BrowserQueueManager } from "../../src/services/browser/queue/browser.queue.js";
import { SessionActionLog } from "../../src/services/browser/logs/action-log.js";
import { SessionLogRegistry } from "../../src/services/browser/logs/session-log-registry.js";
import { BrowserSessionStore } from "../../src/services/browser/session/session.store.js";
import { HighlightService } from "../../src/services/browser/highlight/highlight-service.js";
import { SnapshotEngine } from "../../src/services/browser/snapshot/snapshot-engine.js";
import { SnapshotMemoryTable } from "../../src/services/browser/snapshot/snapshot-memory.js";
import { RecordingService } from "../../src/services/browser/recording/recording.service.js";
import { FakeBrowserBridge } from "../fakes/fake-browser-bridge.js";
import { FakeResourceGovernor } from "../fakes/fake-resource-governor.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("runtime-worker smoke", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  let dataDir: string | undefined;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
    if (dataDir !== undefined) {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    }
  });

  it("wires health, capabilities, and browser plugins together", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(20);
    const dir = path.join(os.tmpdir(), `vindicate-smoke-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    dataDir = dir;
    const disk = new SessionDiskStore(dir, new PlaintextSessionCrypto(), {
      encryptFilenames: false
    });
    const store = new BrowserSessionStore(disk, logger, 24);
    await store.initializeFromDisk();
    const governor = new FakeResourceGovernor();
    const queues = new BrowserQueueManager(governor);
    const commandConfig = {
      VINDICATE_SETTLE_NETWORK_MS: 5000,
      VINDICATE_SETTLE_TIMEOUT_MS: 10_000,
      VINDICATE_ACTION_TIMEOUT_MS: 30_000,
      VINDICATE_ACTION_TIMEOUT_MAX_MS: 120_000
    };
    const sessionLogs = new SessionLogRegistry({ consoleBufferSize: 20, networkBufferSize: 20 });
    const actionLog = new SessionActionLog(100);
    const snapshotEngine = new SnapshotEngine(
      new SnapshotMemoryTable(3),
      {
        VINDICATE_SNAPSHOT_MAX_NODES: 100,
        VINDICATE_SNAPSHOT_MAX_HTML_BYTES: 10_000,
        VINDICATE_MAX_OUTPUT_CHARS: 10_000
      },
      (sessionId, snapshotId) => {
        sessionLogs.setSnapshotId(sessionId, snapshotId);
      }
    );

    const bridge = new FakeBrowserBridge();
    const recordingService = new RecordingService(bridge, store, eventBus, logger);

    app = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 20,
      lifecycle: { isReady: () => true, sessionsDir: dir },
      browser: {
        store,
        bridge,
        queues,
        governor,
        commandConfig,
        snapshotEngine,
        highlightService: new HighlightService(),
        eventBus,
        sessionLogs,
        actionLog,
        maxFileBytes: config.VINDICATE_MAX_FILE_BYTES,
        recordingService
      }
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(RuntimeHealthResponseSchema.safeParse(JSON.parse(health.body) as unknown).success).toBe(
      true
    );

    const caps = await app.inject({
      method: "GET",
      url: "/capabilities",
      headers: internalAuthHeaders()
    });
    expect(caps.statusCode).toBe(200);

    const sessions = await app.inject({
      method: "GET",
      url: "/browser/sessions",
      headers: internalAuthHeaders()
    });
    expect(sessions.statusCode).toBe(200);
  });
});

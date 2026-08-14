/**
 * @file Live CDP smoke — skipped unless VINDICATE_RUN_BROWSER_TESTS=1.
 */
import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { config } from "../../src/core/config.js";
import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { PlaywrightBridge } from "../../src/infrastructure/browser/playwright-bridge.js";

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
import { FakeResourceGovernor } from "../fakes/fake-resource-governor.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const runLive = process.env.VINDICATE_RUN_BROWSER_TESTS === "1";

describe.skipIf(!runLive)("browser e2e smoke", () => {
  let dataDir = "";

  afterEach(async () => {
    if (dataDir !== "") {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  it("creates a session and snapshots example.com", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-e2e", level: "info" });
    const eventBus = new EventBus(50);
    const dir = path.join(os.tmpdir(), `vindicate-e2e-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    dataDir = dir;
    const disk = new SessionDiskStore(dir, new PlaintextSessionCrypto(), { encryptFilenames: false });
    const store = new BrowserSessionStore(disk, logger, 24);
    await store.initializeFromDisk();
    const sessionLogs = new SessionLogRegistry({
      consoleBufferSize: config.VINDICATE_CONSOLE_BUFFER_SIZE,
      networkBufferSize: config.VINDICATE_NETWORK_BUFFER_SIZE
    });
    const actionLog = new SessionActionLog(config.VINDICATE_ACTION_LOG_SIZE);
    const snapshotEngine = new SnapshotEngine(
      new SnapshotMemoryTable(5),
      {
        VINDICATE_SNAPSHOT_MAX_NODES: config.VINDICATE_SNAPSHOT_MAX_NODES,
        VINDICATE_SNAPSHOT_MAX_HTML_BYTES: config.VINDICATE_SNAPSHOT_MAX_HTML_BYTES,
        VINDICATE_MAX_OUTPUT_CHARS: config.VINDICATE_MAX_OUTPUT_CHARS
      },
      (sid, snapId) => {
        sessionLogs.setSnapshotId(sid, snapId);
      }
    );
    const highlightService = new HighlightService();
    const bridge = new PlaywrightBridge(logger, highlightService);
    const governor = new FakeResourceGovernor();
    const recordingService = new RecordingService(bridge, store, eventBus, logger);
    const commandConfig = {
      VINDICATE_SETTLE_NETWORK_MS: config.VINDICATE_SETTLE_NETWORK_MS,
      VINDICATE_SETTLE_TIMEOUT_MS: config.VINDICATE_SETTLE_TIMEOUT_MS,
      VINDICATE_ACTION_TIMEOUT_MS: config.VINDICATE_ACTION_TIMEOUT_MS,
      VINDICATE_ACTION_TIMEOUT_MAX_MS: config.VINDICATE_ACTION_TIMEOUT_MAX_MS
    };
    const app = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 50,
      lifecycle: { isReady: () => true, sessionsDir: dir },
      browser: {
        store,
        bridge,
        queues: new BrowserQueueManager(governor),
        governor,
        commandConfig,
        snapshotEngine,
        highlightService,
        eventBus,
        sessionLogs,
        actionLog,
        maxFileBytes: config.VINDICATE_MAX_FILE_BYTES,
        recordingService
      }
    });

    const created = await app.inject({
      method: "POST",
      url: "/browser/sessions",
      headers: internalAuthHeaders(),
      payload: {
        name: "e2e",
        url: "https://example.com/",
        project_root: dir
      }
    });
    expect(created.statusCode).toBe(200);
    const sessionId = (JSON.parse(created.body) as { session_id: string }).session_id;

    const cmd = await app.inject({
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      headers: internalAuthHeaders(),
      payload: {
        steps: [
          { action: "navigate", url: "https://example.com/" },
          { action: "snapshot" }
        ]
      }
    });
    expect(cmd.statusCode).toBe(200);
    expect(cmd.body).toContain("completed");

    await app.close();
  }, 120_000);
});

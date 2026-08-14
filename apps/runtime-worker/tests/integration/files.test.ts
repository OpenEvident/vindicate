import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

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

describe("Files service HTTP", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  let tmpDirs: string[] = [];

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
    for (const dir of tmpDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it("reads, writes, lists, and deletes files under project root", async () => {
    const root = path.join(os.tmpdir(), `vindicate-files-${Date.now()}`);
    await mkdir(root, { recursive: true });
    tmpDirs.push(root);

    const dataDir = path.join(os.tmpdir(), `vindicate-files-data-${Date.now()}`);
    await mkdir(dataDir, { recursive: true });
    tmpDirs.push(dataDir);

    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(20);
    const disk = new SessionDiskStore(dataDir, new PlaintextSessionCrypto(), { encryptFilenames: false });
    const store = new BrowserSessionStore(disk, logger, 24);
    await store.initializeFromDisk();
    const governor = new FakeResourceGovernor();
    const queues = new BrowserQueueManager(governor);
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
      browser: {
        store,
        bridge,
        queues,
        governor,
        commandConfig: {
          VINDICATE_SETTLE_NETWORK_MS: 5000,
          VINDICATE_SETTLE_TIMEOUT_MS: 10_000,
          VINDICATE_ACTION_TIMEOUT_MS: 30_000,
          VINDICATE_ACTION_TIMEOUT_MAX_MS: 120_000
        },
        snapshotEngine,
        highlightService: new HighlightService(),
        eventBus,
        sessionLogs,
        actionLog,
        maxFileBytes: 1_048_576,
        recordingService
      }
    });

    // Create a session with a specific project_root
    const sessionRes = await app.inject({
      method: "POST",
      url: "/browser/sessions",
      headers: internalAuthHeaders(),
      payload: { name: "files-test", url: "https://example.com/", project_root: root }
    });
    expect(sessionRes.statusCode).toBe(200);
    const sessionId = (JSON.parse(sessionRes.body) as { session_id: string }).session_id;
    const base = `/browser/sessions/${sessionId}/files`;

    const write = await app.inject({
      method: "PUT",
      url: `${base}/write`,
      headers: internalAuthHeaders(),
      payload: { path: "notes/hello.txt", content: "hello vindicate" }
    });
    expect(write.statusCode).toBe(200);

    const read = await app.inject({
      method: "GET",
      url: `${base}/read`,
      headers: internalAuthHeaders(),
      query: { path: "notes/hello.txt" }
    });
    expect(read.statusCode).toBe(200);
    const readBody = JSON.parse(read.body) as { content: string };
    expect(readBody.content).toBe("hello vindicate");

    const list = await app.inject({
      method: "GET",
      url: `${base}/list`,
      headers: internalAuthHeaders(),
      query: { path: "." }
    });
    expect(list.statusCode).toBe(200);
    const items = (JSON.parse(list.body) as { items: string[] }).items;
    expect(items.some((i) => i.includes("hello.txt"))).toBe(true);

    const outside = await app.inject({
      method: "GET",
      url: `${base}/read`,
      headers: internalAuthHeaders(),
      query: { path: "../../../etc/passwd" }
    });
    expect(outside.statusCode).toBe(403);

    await writeFile(path.join(root, "notes", "remove-me.txt"), "x", "utf8");
    const del = await app.inject({
      method: "DELETE",
      url: `${base}/delete`,
      headers: internalAuthHeaders(),
      query: { path: "notes/remove-me.txt" }
    });
    expect(del.statusCode).toBe(200);
  });
});

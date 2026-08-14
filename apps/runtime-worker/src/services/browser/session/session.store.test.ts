import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { PlaintextSessionCrypto } from "../../../infrastructure/crypto/session-crypto.js";
import type { ISessionDiskStore } from "../../../infrastructure/persistence/session-disk-store.interface.js";
import { SessionDiskStore } from "../../../infrastructure/persistence/session-disk-store.js";
import { BrowserSessionStore } from "./session.store.js";

class FailingDiskStore implements ISessionDiskStore {
  private writeCount = 0;

  constructor(private readonly inner: ISessionDiskStore) {}

  write(sessionId: string, plaintextJson: string): Promise<void> {
    this.writeCount += 1;
    if (this.writeCount >= 2) {
      return Promise.reject(new Error("disk full"));
    }
    return this.inner.write(sessionId, plaintextJson);
  }

  read(sessionId: string): Promise<string | null> {
    return this.inner.read(sessionId);
  }

  delete(sessionId: string): Promise<void> {
    return this.inner.delete(sessionId);
  }

  listExpiredDeadSessions(ttlHours: number, nowMs?: number): Promise<string[]> {
    return this.inner.listExpiredDeadSessions(ttlHours, nowMs);
  }

  listAllIds(): Promise<string[]> {
    return this.inner.listAllIds();
  }
}

describe("BrowserSessionStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("create, get, applyTrigger end removes session", async () => {
    const dir = path.join(os.tmpdir(), `vindicate-store-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const disk = new SessionDiskStore(dir, new PlaintextSessionCrypto(), { encryptFilenames: false });
    const store = new BrowserSessionStore(disk, logger, 24);
    await store.initializeFromDisk();
    const rec = await store.create({
      name: "t",
      url: "https://example.com/",
      project_root: "/tmp"
    });
    expect(store.get(rec.session_id)?.status).toBe("active");
    await store.applyTrigger(rec.session_id, "end");
    expect(store.get(rec.session_id)).toBeUndefined();
  });

  it("applyTrigger leaves memory unchanged when disk persist fails", async () => {
    const dir = path.join(os.tmpdir(), `vindicate-store-fail-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const inner = new SessionDiskStore(dir, new PlaintextSessionCrypto(), { encryptFilenames: false });
    const disk = new FailingDiskStore(inner);
    const store = new BrowserSessionStore(disk, logger, 24);
    await store.initializeFromDisk();
    const rec = await store.create({ name: "t", url: "https://example.com/", project_root: "/tmp" });
    await expect(store.applyTrigger(rec.session_id, "pause")).rejects.toThrow("disk full");
    expect(store.get(rec.session_id)?.status).toBe("active");
  });
});

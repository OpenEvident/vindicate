import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { PlaintextSessionCrypto } from "../../../infrastructure/crypto/session-crypto.js";
import { SessionDiskStore } from "../../../infrastructure/persistence/session-disk-store.js";
import { SessionNotFoundError } from "../../../shared/errors/worker.errors.js";
import { BrowserSessionStore } from "./session.store.js";

describe("BrowserSessionStore concurrency", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent end triggers — only one succeeds", async () => {
    const dir = path.join(os.tmpdir(), `vindicate-store-race-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const disk = new SessionDiskStore(dir, new PlaintextSessionCrypto(), {
      encryptFilenames: false
    });
    const store = new BrowserSessionStore(disk, logger, 24);
    const rec = await store.create({
      name: "t",
      url: "https://example.com/",
      project_root: "/tmp"
    });

    const results = await Promise.allSettled([
      store.applyTrigger(rec.session_id, "end"),
      store.applyTrigger(rec.session_id, "end")
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SessionNotFoundError);
    expect(store.get(rec.session_id)).toBeUndefined();
  });
});

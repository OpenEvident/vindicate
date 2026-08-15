import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PlaintextSessionCrypto } from "../crypto/session-crypto.js";
import { SessionDiskStore } from "./session-disk-store.js";

describe("SessionDiskStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes, reads, deletes session blobs", async () => {
    const dir = path.join(os.tmpdir(), `vindicate-disk-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const crypto = new PlaintextSessionCrypto();
    const disk = new SessionDiskStore(dir, crypto, { encryptFilenames: false });
    const id = "11111111-1111-1111-1111-111111111111";
    await disk.write(id, '{"x":1}');
    expect(await disk.read(id)).toBe('{"x":1}');
    await disk.delete(id);
    expect(await disk.read(id)).toBeNull();
  });

  it("lists expired dead sessions using last_active_at", async () => {
    const dir = path.join(os.tmpdir(), `vindicate-disk-exp-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);
    const crypto = new PlaintextSessionCrypto();
    const disk = new SessionDiskStore(dir, crypto, { encryptFilenames: false });
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const payload = JSON.stringify({
      session_id: "22222222-2222-2222-2222-222222222222",
      name: "n",
      status: "dead",
      url: "https://example.com",
      headless: false,
      created_at: old,
      last_active_at: old
    });
    await writeFile(
      path.join(dir, "22222222-2222-2222-2222-222222222222.json"),
      await crypto.encrypt(payload)
    );
    const expired = await disk.listExpiredDeadSessions(24, Date.now());
    expect(expired).toContain("22222222-2222-2222-2222-222222222222");
  });
});

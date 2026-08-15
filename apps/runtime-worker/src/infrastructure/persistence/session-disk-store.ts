/**
 * @file ~/.vindicate/sessions persistence — format is ciphertext of UTF-8 JSON (or plaintext JSON).
 */
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ISessionCrypto } from "../crypto/session-crypto.interface.js";
import type { ISessionDiskStore } from "./session-disk-store.interface.js";
import { resolveProjectPath } from "../../services/files/path-guard.js";

export interface SessionDiskStoreOptions {
  readonly encryptFilenames: boolean;
}

export class SessionDiskStore implements ISessionDiskStore {
  private readonly sessionsDir: string;

  constructor(
    sessionsDir: string,
    private readonly crypto: ISessionCrypto,
    private readonly options: SessionDiskStoreOptions
  ) {
    this.sessionsDir = sessionsDir;
  }

  static defaultDir(): string {
    return path.join(os.homedir(), ".vindicate", "sessions");
  }

  private pathFor(sessionId: string): string {
    const ext = this.options.encryptFilenames ? ".enc" : ".json";
    return resolveProjectPath(this.sessionsDir, `${sessionId}${ext}`);
  }

  private alternatePath(sessionId: string): string {
    const ext = this.options.encryptFilenames ? ".json" : ".enc";
    return resolveProjectPath(this.sessionsDir, `${sessionId}${ext}`);
  }

  async write(sessionId: string, plaintextJson: string): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    const buf = await this.crypto.encrypt(plaintextJson);
    await writeFile(this.pathFor(sessionId), buf);
  }

  async read(sessionId: string): Promise<string | null> {
    for (const filePath of [this.pathFor(sessionId), this.alternatePath(sessionId)]) {
      try {
        const buf = await readFile(filePath);
        const text = await this.crypto.decrypt(buf);
        if (text !== null) {
          return text;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  }

  async delete(sessionId: string): Promise<void> {
    for (const filePath of [this.pathFor(sessionId), this.alternatePath(sessionId)]) {
      try {
        await unlink(filePath);
      } catch {
        /* ignore */
      }
    }
  }

  async listAllIds(): Promise<string[]> {
    const names = await readdir(this.sessionsDir).catch(() => [] as string[]);
    const ids = new Set<string>();
    for (const name of names) {
      const m = /^([0-9a-fA-F-]{36})\.(?:enc|json)$/.exec(name);
      if (m?.[1] !== undefined) {
        ids.add(m[1]);
      }
    }
    return [...ids];
  }

  async listExpiredDeadSessions(ttlHours: number, nowMs: number = Date.now()): Promise<string[]> {
    const ttlMs = ttlHours * 3_600_000;
    const expired: string[] = [];
    for (const id of await this.listAllIds()) {
      const raw = await this.read(id);
      if (raw === null) {
        expired.push(id);
        continue;
      }
      let parsed: { status?: string; last_active_at?: string };
      try {
        parsed = JSON.parse(raw) as { status?: string; last_active_at?: string };
      } catch {
        expired.push(id);
        continue;
      }
      if (parsed.status !== "dead" || parsed.last_active_at === undefined) {
        continue;
      }
      const last = Date.parse(parsed.last_active_at);
      if (Number.isNaN(last)) {
        continue;
      }
      if (nowMs - last > ttlMs) {
        expired.push(id);
      }
    }
    return expired;
  }
}

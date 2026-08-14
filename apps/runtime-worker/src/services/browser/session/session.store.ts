/**
 * @file Persisted + in-memory browser session aggregate.
 */
import type { BrowserCreateSessionBody } from "@vindicate/protocol";
import type { Logger } from "@vindicate/observability";
import { randomUUID } from "node:crypto";

import type { ISessionDiskStore } from "../../../infrastructure/persistence/session-disk-store.interface.js";
import { SessionNotFoundError } from "../../../shared/errors/worker.errors.js";
import { AsyncLock } from "../../../shared/async-lock.js";
import type { ISessionStore } from "./session.store.interface.js";
import type { BrowserSessionListItem, BrowserSessionRecord } from "./session.types.js";
import { transition, type SessionState, type SessionTrigger } from "./session.state-machine.js";

export type { BrowserSessionListItem, BrowserSessionRecord } from "./session.types.js";

export class BrowserSessionStore implements ISessionStore {
  private readonly memory = new Map<string, BrowserSessionRecord>();
  private readonly sessionLock = new AsyncLock();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly disk: ISessionDiskStore,
    private readonly logger: Logger,
    private readonly ttlHours: number
  ) {}

  async initializeFromDisk(): Promise<void> {
    try {
      await this.cleanup();
    } catch (err: unknown) {
      this.logger.error({ err }, "session cleanup at startup failed — continuing");
    }

    let ids: string[];
    try {
      ids = await this.disk.listAllIds();
    } catch (err: unknown) {
      this.logger.error({ err }, "failed to list session blobs — starting with empty in-memory store");
      return;
    }

    for (const id of ids) {
      try {
        const raw = await this.disk.read(id);
        if (raw === null) {
          this.logger.warn({ sessionId: id }, "unreadable session blob — removing");
          await this.disk.delete(id);
          continue;
        }
        let parsed: BrowserSessionRecord;
        try {
          parsed = JSON.parse(raw) as BrowserSessionRecord;
        } catch {
          await this.disk.delete(id);
          continue;
        }
        if (parsed.status === "closed" || parsed.status === "expired") {
          await this.disk.delete(id);
          continue;
        }
        if (parsed.session_id !== id) {
          await this.disk.delete(id);
          continue;
        }
        this.memory.set(id, parsed);
      } catch (err: unknown) {
        this.logger.warn({ err, sessionId: id }, "failed to load session blob — skipping");
      }
    }
  }

  /** Starts a periodic TTL sweep; returns a dispose function for graceful shutdown. */
  startPeriodicCleanup(intervalMs: number): () => void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      void this.cleanup().catch((err: unknown) => {
        this.logger.warn({ err }, "periodic session cleanup failed");
      });
    }, intervalMs);
    return () => {
      if (this.cleanupTimer !== undefined) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }
    };
  }

  async cleanup(): Promise<void> {
    for (const id of await this.disk.listExpiredDeadSessions(this.ttlHours)) {
      await this.disk.delete(id);
      this.memory.delete(id);
      this.logger.info({ sessionId: id }, "removed expired dead session from disk");
    }

    const ttlMs = this.ttlHours * 3_600_000;
    const now = Date.now();
    for (const [id, rec] of [...this.memory.entries()]) {
      if (rec.status !== "dead") {
        continue;
      }
      const ageMs = now - Date.parse(rec.last_active_at);
      if (Number.isFinite(ageMs) && ageMs >= ttlMs) {
        await this.disk.delete(id).catch((err: unknown) => {
          this.logger.warn({ err, sessionId: id }, "failed to delete expired dead session blob");
        });
        this.memory.delete(id);
        this.logger.info({ sessionId: id }, "removed expired dead session from memory");
      }
    }
  }

  async create(input: BrowserCreateSessionBody): Promise<BrowserSessionRecord> {
    const session_id = randomUUID();
    const now = new Date().toISOString();
    const record: BrowserSessionRecord = {
      session_id,
      name: input.name,
      url: input.url,
      project_root: input.project_root,
      status: "active",
      headless: input.headless ?? false,
      created_at: now,
      last_active_at: now,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.testid_attr !== undefined ? { testid_attr: input.testid_attr } : {}),
      ...(input.viewport !== undefined ? { viewport: input.viewport } : {})
    };
    this.memory.set(session_id, record);
    await this.persist(record);
    return record;
  }

  get(sessionId: string): BrowserSessionRecord | undefined {
    return this.memory.get(sessionId);
  }

  /** Removes a freshly created session when Playwright context creation fails (no valid transition). */
  async abandon(sessionId: string): Promise<void> {
    this.memory.delete(sessionId);
    await this.disk.delete(sessionId);
  }

  async applyTrigger(sessionId: string, trigger: SessionTrigger): Promise<SessionState> {
    return this.sessionLock.run(sessionId, async () => {
      const rec = this.memory.get(sessionId);
      if (rec === undefined) {
        throw new SessionNotFoundError(sessionId);
      }
      const next = transition(rec.status, trigger);
      const updated: BrowserSessionRecord = {
        ...rec,
        status: next,
        last_active_at: new Date().toISOString()
      };
      if (next === "closed" || next === "expired") {
        await this.disk.delete(sessionId);
        this.memory.delete(sessionId);
      } else {
        await this.persist(updated);
        this.memory.set(sessionId, updated);
      }
      return next;
    });
  }

  async flush(): Promise<void> {
    for (const rec of this.memory.values()) {
      if (rec.status === "closed" || rec.status === "expired") {
        continue;
      }
      await this.persist(rec);
    }
  }

  list(): BrowserSessionListItem[] {
    const out: BrowserSessionListItem[] = [];
    for (const rec of this.memory.values()) {
      if (rec.status !== "active" && rec.status !== "dead" && rec.status !== "paused") {
        continue;
      }
      out.push({
        session_id: rec.session_id,
        name: rec.name,
        url: rec.url,
        created_at: rec.created_at,
        last_active_at: rec.last_active_at,
        status: rec.status,
        ...(rec.description !== undefined ? { description: rec.description } : {}),
        ...(rec.status === "dead" ? { resumable: true as const } : {})
      });
    }
    return out;
  }

  private async persist(rec: BrowserSessionRecord): Promise<void> {
    await this.disk.write(rec.session_id, JSON.stringify(rec));
  }
}

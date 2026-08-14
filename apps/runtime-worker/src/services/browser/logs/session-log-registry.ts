/**
 * @file Per-session console/network ring buffers (BROWSER-SERVICE §6).
 */
import type { BrowserContext, Page } from "playwright-core";

import { RingBuffer } from "../../../shared/ring-buffer.js";
import type { ConsoleLogEntry, ConsoleLogLevel, NetworkLogEntry } from "./session-log.types.js";

interface SessionLogState {
  readonly console: RingBuffer<ConsoleLogEntry>;
  readonly network: RingBuffer<NetworkLogEntry>;
  snapshotId: number;
}

export interface SessionLogRegistryConfig {
  readonly consoleBufferSize: number;
  readonly networkBufferSize: number;
}

export class SessionLogRegistry {
  private readonly sessions = new Map<string, SessionLogState>();
  private readonly wiredContexts = new WeakSet<BrowserContext>();

  constructor(private readonly config: SessionLogRegistryConfig) {}

  ensure(sessionId: string): SessionLogState {
    let s = this.sessions.get(sessionId);
    if (s === undefined) {
      s = {
        console: new RingBuffer(this.config.consoleBufferSize),
        network: new RingBuffer(this.config.networkBufferSize),
        snapshotId: 0
      };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  drop(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private getActiveState(sessionId: string): SessionLogState | undefined {
    return this.sessions.get(sessionId);
  }

  private pushConsole(sessionId: string, entry: ConsoleLogEntry): void {
    const state = this.getActiveState(sessionId);
    if (state === undefined) {
      return;
    }
    state.console.push(entry);
  }

  private pushNetwork(sessionId: string, entry: NetworkLogEntry): void {
    const state = this.getActiveState(sessionId);
    if (state === undefined) {
      return;
    }
    state.network.push(entry);
  }

  setSnapshotId(sessionId: string, snapshotId: number): void {
    const state = this.getActiveState(sessionId);
    if (state === undefined) {
      return;
    }
    state.snapshotId = snapshotId;
  }

  getSnapshotId(sessionId: string): number {
    return this.getActiveState(sessionId)?.snapshotId ?? 0;
  }

  attachContext(sessionId: string, context: BrowserContext): void {
    if (this.wiredContexts.has(context)) {
      return;
    }
    this.wiredContexts.add(context);
    this.ensure(sessionId);

    const onPage = (page: Page): void => {
      page.on("console", (msg) => {
        const state = this.getActiveState(sessionId);
        if (state === undefined) {
          return;
        }
        const level = msg.type() as ConsoleLogLevel;
        const normalized: ConsoleLogLevel =
          level === "log" || level === "info" || level === "warn" || level === "error" || level === "debug"
            ? level
            : "log";
        this.pushConsole(sessionId, {
          level: normalized,
          message: msg.text(),
          timestamp_ms: Date.now(),
          snapshot_id_at_capture: state.snapshotId
        });
      });

      page.on("request", (req) => {
        const type = req.resourceType();
        if (type !== "xhr" && type !== "fetch") {
          return;
        }
        const started = Date.now();
        req.response()
          .then((res) => {
            this.pushNetwork(sessionId, {
              method: req.method(),
              url: req.url(),
              status: res?.status() ?? 0,
              duration_ms: Date.now() - started,
              timestamp_ms: started,
              snapshot_id_at_capture: this.getSnapshotId(sessionId)
            });
          })
          .catch(() => {
            /* ignore aborted requests */
          });
      });
    };

    for (const page of context.pages()) {
      onPage(page);
    }
    context.on("page", onPage);
  }

  queryConsole(
    sessionId: string,
    filters: {
      readonly since_snapshot_id?: number | undefined;
      readonly level?: ConsoleLogLevel | undefined;
      readonly limit?: number | undefined;
    }
  ): ConsoleLogEntry[] {
    const state = this.getActiveState(sessionId);
    if (state === undefined) {
      return [];
    }
    let rows = [...state.console.snapshot()];
    if (filters.since_snapshot_id !== undefined) {
      rows = rows.filter((e) => e.snapshot_id_at_capture > filters.since_snapshot_id!);
    }
    if (filters.level !== undefined) {
      rows = rows.filter((e) => e.level === filters.level);
    }
    if (filters.limit !== undefined) {
      rows = rows.slice(-filters.limit);
    }
    return rows;
  }

  queryNetwork(
    sessionId: string,
    filters: {
      readonly since_snapshot_id?: number | undefined;
      readonly status_min?: number | undefined;
      readonly url_contains?: string | undefined;
      readonly limit?: number | undefined;
    }
  ): NetworkLogEntry[] {
    const state = this.getActiveState(sessionId);
    if (state === undefined) {
      return [];
    }
    let rows = [...state.network.snapshot()];
    if (filters.since_snapshot_id !== undefined) {
      rows = rows.filter((e) => e.snapshot_id_at_capture > filters.since_snapshot_id!);
    }
    if (filters.status_min !== undefined) {
      rows = rows.filter((e) => e.status >= filters.status_min!);
    }
    if (filters.url_contains !== undefined) {
      const needle = filters.url_contains.toLowerCase();
      rows = rows.filter((e) => e.url.toLowerCase().includes(needle));
    }
    if (filters.limit !== undefined) {
      rows = rows.slice(-filters.limit);
    }
    return rows;
  }
}

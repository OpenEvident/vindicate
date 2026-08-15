/**
 * @file In-memory snapshot ref maps for delta overlay (BROWSER-SERVICE §1.9).
 */
import type { RefSnapshotForDelta } from "./delta-computer.js";

export interface CachedSnapshotEntry {
  readonly url: string;
  readonly refMap: Readonly<Record<string, RefSnapshotForDelta>>;
}

interface SessionSnapState {
  nextSnapshotId: number;
  readonly cache: Map<number, CachedSnapshotEntry>;
}

export class SnapshotMemoryTable {
  private readonly sessions = new Map<string, SessionSnapState>();

  constructor(private readonly maxCachedSnapshots: number) {}

  onNavigation(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s !== undefined) {
      s.cache.clear();
    }
  }

  dropSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  allocateSnapshotId(sessionId: string): number {
    let s = this.sessions.get(sessionId);
    if (s === undefined) {
      s = { nextSnapshotId: 0, cache: new Map() };
      this.sessions.set(sessionId, s);
    }
    s.nextSnapshotId += 1;
    return s.nextSnapshotId;
  }

  getEntry(sessionId: string, snapshotId: number): CachedSnapshotEntry | undefined {
    return this.sessions.get(sessionId)?.cache.get(snapshotId);
  }

  commit(
    sessionId: string,
    snapshotId: number,
    url: string,
    refMap: Record<string, RefSnapshotForDelta>
  ): void {
    let s = this.sessions.get(sessionId);
    if (s === undefined) {
      s = { nextSnapshotId: snapshotId, cache: new Map() };
      this.sessions.set(sessionId, s);
    }
    s.cache.set(snapshotId, { url, refMap });
    while (s.cache.size > this.maxCachedSnapshots) {
      const oldest = Math.min(...s.cache.keys());
      s.cache.delete(oldest);
    }
  }
}

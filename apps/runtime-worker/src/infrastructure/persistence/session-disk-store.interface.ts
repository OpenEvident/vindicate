/**
 * @file Encrypted session blobs on local disk (~/.vindicate/sessions).
 */
export interface ISessionDiskStore {
  write(sessionId: string, plaintextJson: string): Promise<void>;
  /** `null` when missing or unreadable. */
  read(sessionId: string): Promise<string | null>;
  delete(sessionId: string): Promise<void>;
  /** Session ids whose on-disk `dead` records are past TTL (hours since `last_active_at`). */
  listExpiredDeadSessions(ttlHours: number, nowMs?: number): Promise<string[]>;
  /** All session ids that have a persisted file (either extension). */
  listAllIds(): Promise<string[]>;
}

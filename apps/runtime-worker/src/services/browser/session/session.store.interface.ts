/**
 * @file Browser session persistence seam (IMPLEMENTATION-PLAN §4).
 */
import type { BrowserCreateSessionBody } from "@vindicate/protocol";

import type { BrowserSessionListItem, BrowserSessionRecord } from "./session.types.js";
import type { SessionState, SessionTrigger } from "./session.state-machine.js";

export interface ISessionStore {
  initializeFromDisk(): Promise<void>;
  startPeriodicCleanup(intervalMs: number): () => void;
  cleanup(): Promise<void>;
  create(input: BrowserCreateSessionBody): Promise<BrowserSessionRecord>;
  get(sessionId: string): BrowserSessionRecord | undefined;
  abandon(sessionId: string): Promise<void>;
  applyTrigger(sessionId: string, trigger: SessionTrigger): Promise<SessionState>;
  list(): BrowserSessionListItem[];
  flush(): Promise<void>;
}

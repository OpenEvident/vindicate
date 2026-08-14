import type { SessionState } from "./session.state-machine.js";

export interface BrowserSessionRecord {
  readonly session_id: string;
  name: string;
  description?: string;
  status: SessionState;
  url: string;
  project_root: string;
  testid_attr?: string;
  viewport?: { width: number; height: number };
  headless: boolean;
  created_at: string;
  last_active_at: string;
}

export interface BrowserSessionListItem {
  session_id: string;
  name: string;
  description?: string;
  status: "active" | "dead" | "paused";
  resumable?: boolean;
  url: string;
  created_at: string;
  last_active_at: string;
}

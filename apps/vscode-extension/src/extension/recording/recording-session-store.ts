import type * as vscode from "vscode";

export interface SavedRecordingSession {
  id: string;
  name: string;
  safeName: string;
  status: "recording" | "review" | "finalized" | "abandoned";
  stepCount: number;
  startedAt: string;
  projectRoot: string;
  artifactPath?: string;
  thumbnailPath?: string;
  started_by?: "human" | "agent";
  preconditionRecordings?: string[];
}

const STORAGE_KEY = "vindicate.recordings";

export class RecordingSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getAll(): SavedRecordingSession[] {
    return this.context.globalState.get<SavedRecordingSession[]>(STORAGE_KEY) ?? [];
  }

  upsert(session: SavedRecordingSession): void {
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      all[idx] = session;
    } else {
      all.unshift(session);
    }
    void this.context.globalState.update(STORAGE_KEY, all);
  }

  updateStatus(
    id: string,
    status: SavedRecordingSession["status"],
    extra?: Partial<SavedRecordingSession>
  ): void {
    const all = this.getAll();
    const session = all.find((s) => s.id === id);
    if (session !== undefined) {
      Object.assign(session, { status, ...extra });
      void this.context.globalState.update(STORAGE_KEY, all);
    }
  }

  remove(id: string): void {
    const all = this.getAll().filter((s) => s.id !== id);
    void this.context.globalState.update(STORAGE_KEY, all);
  }
}

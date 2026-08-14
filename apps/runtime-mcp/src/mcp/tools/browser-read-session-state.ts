/** Per-session browser_read delta and max_nodes — cleared on browser_session close. */
export class BrowserReadSessionState {
  private readonly lastSnapshotIdBySession = new Map<string, number>();
  private readonly maxNodesBySession = new Map<string, number>();

  setMaxNodes(sessionId: string, maxNodes: number): void {
    this.maxNodesBySession.set(sessionId, maxNodes);
  }

  getMaxNodes(sessionId: string): number | undefined {
    return this.maxNodesBySession.get(sessionId);
  }

  getLastSnapshotId(sessionId: string): number | undefined {
    return this.lastSnapshotIdBySession.get(sessionId);
  }

  setLastSnapshotId(sessionId: string, snapshotId: number): void {
    this.lastSnapshotIdBySession.set(sessionId, snapshotId);
  }

  clearSession(sessionId: string): void {
    this.lastSnapshotIdBySession.delete(sessionId);
    this.maxNodesBySession.delete(sessionId);
  }
}

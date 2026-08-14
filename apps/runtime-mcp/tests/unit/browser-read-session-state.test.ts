import { describe, expect, it } from "vitest";

import { BrowserReadSessionState } from "../../src/mcp/tools/browser-read-session-state.js";

describe("BrowserReadSessionState", () => {
  it("tracks snapshot id and max_nodes per session", () => {
    const state = new BrowserReadSessionState();
    state.setMaxNodes("sess-a", 50);
    state.setLastSnapshotId("sess-a", 3);
    expect(state.getMaxNodes("sess-a")).toBe(50);
    expect(state.getLastSnapshotId("sess-a")).toBe(3);
  });

  it("clearSession removes delta and max_nodes for that session only", () => {
    const state = new BrowserReadSessionState();
    state.setMaxNodes("sess-a", 50);
    state.setLastSnapshotId("sess-a", 3);
    state.setMaxNodes("sess-b", 80);
    state.setLastSnapshotId("sess-b", 7);

    state.clearSession("sess-a");

    expect(state.getMaxNodes("sess-a")).toBeUndefined();
    expect(state.getLastSnapshotId("sess-a")).toBeUndefined();
    expect(state.getMaxNodes("sess-b")).toBe(80);
    expect(state.getLastSnapshotId("sess-b")).toBe(7);
  });
});

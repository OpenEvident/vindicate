import { describe, expect, it } from "vitest";

import { RecordingStore } from "./recording.store.js";
import type { RecordingEventPayload } from "./recording.types.js";

const basePayload: RecordingEventPayload = {
  action: "click",
  timestamp: "2026-06-07T10:00:00.000Z",
  candidates: [{ strategy: "testid", value: "btn" }],
  chosen: { strategy: "testid", value: "btn" },
  element: { tag: "button", name: "Submit" }
};

describe("RecordingStore", () => {
  it("creates a recording session with a safe name", () => {
    const store = new RecordingStore();
    const state = store.create("sess-1", "Login Flow", "/proj", "data-testid");
    expect(state.safeName).toBe("Login-Flow");
    expect(state.status).toBe("recording");
    expect(state.started_by).toBe("human");
  });

  it("stores started_by when provided", () => {
    const store = new RecordingStore();
    const state = store.create("sess-1", "Login Flow", "/proj", "data-testid", "agent");
    expect(state.started_by).toBe("agent");
  });

  it("adds steps only while recording", () => {
    const store = new RecordingStore();
    store.create("sess-1", "Flow", "/proj", "data-testid");
    expect(store.addStep("sess-1", basePayload)).toBe(1);
    store.stop("sess-1");
    expect(store.addStep("sess-1", basePayload)).toBe(-1);
  });

  it("re-sequences replaced steps", () => {
    const store = new RecordingStore();
    store.create("sess-1", "Flow", "/proj", "data-testid");
    store.addStep("sess-1", basePayload);
    store.addStep("sess-1", { ...basePayload, action: "type", text: "hello" });
    store.replaceSteps("sess-1", [{ ...basePayload, seq: 99 }]);
    expect(store.get("sess-1")?.steps.map((s) => s.seq)).toEqual([1]);
  });

  it("transitions recording → review → finalized", () => {
    const store = new RecordingStore();
    store.create("sess-1", "Flow", "/proj", "data-testid");
    expect(store.stop("sess-1")).toBe(true);
    expect(store.get("sess-1")?.status).toBe("review");
    expect(store.finalize("sess-1")?.status).toBe("finalized");
  });
});

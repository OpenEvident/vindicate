import type { RecordingEventPayload, RecordingPageSnapshot, RecordingSessionState, RecordingStep } from "./recording.types.js";
import { sanitizeRecordingName } from "./recording-name.js";

export class RecordingStore {
  private readonly sessions = new Map<string, RecordingSessionState>();

  create(
    sessionId: string,
    name: string,
    projectRoot: string,
    testidAttr: string,
    started_by: "human" | "agent" = "human"
  ): RecordingSessionState {
    const state: RecordingSessionState = {
      sessionId,
      name,
      safeName: sanitizeRecordingName(name),
      projectRoot,
      status: "recording",
      steps: [],
      startedAt: new Date().toISOString(),
      testidAttr,
      started_by
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  get(sessionId: string): RecordingSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  addStep(sessionId: string, payload: RecordingEventPayload): number {
    const state = this.sessions.get(sessionId);
    if (state === undefined || state.status !== "recording") {
      return -1;
    }
    const seq = state.steps.length + 1;
    state.steps.push({ ...payload, seq });
    return seq;
  }

  updateStepScreenshot(sessionId: string, seq: number, screenshotFile: string): void {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      return;
    }
    const step = state.steps.find((s) => s.seq === seq);
    if (step !== undefined) {
      step.screenshot_after = screenshotFile;
    }
  }

  updateStepPageSnapshot(sessionId: string, seq: number, pageSnapshot: RecordingPageSnapshot): void {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      return;
    }
    const step = state.steps.find((s) => s.seq === seq);
    if (step !== undefined) {
      step.page_snapshot = pageSnapshot;
    }
  }

  replaceSteps(sessionId: string, steps: RecordingStep[]): void {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      return;
    }
    state.steps = steps.map((s, i) => ({ ...s, seq: i + 1 }));
  }

  stop(sessionId: string): boolean {
    const state = this.sessions.get(sessionId);
    if (state === undefined || state.status !== "recording") {
      return false;
    }
    state.status = "review";
    return true;
  }

  finalize(sessionId: string): RecordingSessionState | undefined {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      return undefined;
    }
    state.status = "finalized";
    return state;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

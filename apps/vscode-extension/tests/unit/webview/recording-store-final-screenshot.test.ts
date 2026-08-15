import { beforeEach, describe, expect, it } from "vitest";

import {
  useRecordingStore,
  selectEditorRecordedSteps,
  selectEditorTimelineStepCount,
  getTimelineStepNumber,
  resolveReviewPreviewTarget,
  selectIsEditingSavedArtifact
} from "../../../src/webview/stores/recordingStore";
import type { RecordingStep } from "../../../src/webview/lib/recording-ui-types";

const step = (seq: number, screenshotUrl?: string): RecordingStep => ({
  seq,
  action: "click",
  timestamp: new Date().toISOString(),
  candidates: [],
  chosen: null,
  ...(screenshotUrl !== undefined ? { screenshotUrl } : {})
});

const navigateStep = (
  seq: number,
  trigger: "explicit" | "implicit" = "explicit"
): RecordingStep => ({
  seq,
  action: "navigate",
  url: "https://example.com/",
  timestamp: new Date().toISOString(),
  candidates: [],
  chosen: null,
  navigationTrigger: trigger
});

describe("recordingStore final screenshot", () => {
  beforeEach(() => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [
        step(1, "https://example.com/step-001.png"),
        step(2, "https://example.com/step-002.png")
      ],
      finalScreenshotUrl: null,
      previewTarget: { type: "none" }
    });
  });

  it("completeRecordingStop uses final.png and selects final preview", () => {
    useRecordingStore.getState().completeRecordingStop("https://example.com/final.png");

    const state = useRecordingStore.getState();
    expect(state.mode).toBe("review");
    expect(state.finalScreenshotUrl).toBe("https://example.com/final.png");
    expect(state.previewTarget).toEqual({ type: "final" });
  });

  it("completeRecordingStop without final.png keeps the last captured step selected", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [
        step(1, "https://example.com/step-001.png"),
        step(2, "https://example.com/step-002.png")
      ],
      previewTarget: { type: "step", seq: 2 },
      finalScreenshotUrl: null
    });

    useRecordingStore.getState().completeRecordingStop(null);

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 2 });
  });

  it("setMode(review) selects the last captured step when final.png is unavailable", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [
        step(1, "https://example.com/step-001.png"),
        step(2, "https://example.com/step-002.png")
      ],
      previewTarget: { type: "step", seq: 2 },
      finalScreenshotUrl: null
    });

    useRecordingStore.getState().setMode("review");

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 2 });
  });

  it("resolveReviewPreviewTarget avoids final preview without a final screenshot", () => {
    const target = resolveReviewPreviewTarget({
      ...useRecordingStore.getState(),
      mode: "review",
      finalScreenshotUrl: null,
      steps: [step(1, "https://example.com/step-001.png")]
    });
    expect(target).toEqual({ type: "step", seq: 1 });
  });

  it("resolveReviewPreviewTarget treats empty final screenshot as unavailable", () => {
    const target = resolveReviewPreviewTarget({
      ...useRecordingStore.getState(),
      mode: "review",
      finalScreenshotUrl: "",
      steps: [step(1, "https://example.com/step-001.png")]
    });
    expect(target).toEqual({ type: "step", seq: 1 });
  });

  it("resolveReviewPreviewTarget handles undefined final screenshot safely", () => {
    const target = resolveReviewPreviewTarget({
      ...useRecordingStore.getState(),
      mode: "review",
      finalScreenshotUrl: undefined as unknown as string | null,
      steps: [step(1, "https://example.com/step-001.png")]
    });
    expect(target).toEqual({ type: "step", seq: 1 });
  });

  it("appendSteps preserves screenshotUrl when resync omits it", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [step(1, "https://example.com/step-001.png")],
      previewTarget: { type: "step", seq: 1 }
    });

    useRecordingStore.getState().appendSteps([step(1)]);

    expect(useRecordingStore.getState().steps[0]?.screenshotUrl).toBe(
      "https://example.com/step-001.png"
    );
  });

  it("completeRecordingStop(null) preserves an existing finalScreenshotUrl fallback", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [step(1, "https://example.com/step-001.png")],
      finalScreenshotUrl: "https://example.com/step-001.png",
      previewTarget: { type: "step", seq: 1 }
    });

    useRecordingStore.getState().completeRecordingStop(null);

    expect(useRecordingStore.getState().finalScreenshotUrl).toBe(
      "https://example.com/step-001.png"
    );
    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "final" });
  });

  it("setFinalized keeps last step preview when final capture is unavailable", () => {
    useRecordingStore.setState({
      mode: "review",
      steps: [step(1, "https://example.com/step-001.png")],
      finalScreenshotUrl: null,
      previewTarget: { type: "step", seq: 1 }
    });

    useRecordingStore.getState().setFinalized(".vindicate/recordings/login.json");

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 1 });
  });

  it("stopRecording sets stop loading until completeRecordingStop arrives", () => {
    useRecordingStore.setState({
      mode: "recording",
      sessionId: "session-1",
      isStopping: false
    });

    useRecordingStore.getState().stopRecording();
    expect(useRecordingStore.getState().isStopping).toBe(true);

    useRecordingStore.getState().completeRecordingStop("https://example.com/final.png");
    expect(useRecordingStore.getState().isStopping).toBe(false);
  });

  it("appendSteps does not overwrite final screenshot after stop", () => {
    useRecordingStore.getState().completeRecordingStop("https://example.com/final.png");
    useRecordingStore.getState().appendSteps([step(3, "https://example.com/step-003.png")]);

    expect(useRecordingStore.getState().finalScreenshotUrl).toBe("https://example.com/final.png");
  });

  it("restoreSession prefers explicit finalScreenshotUrl over last step screenshot", () => {
    useRecordingStore.getState().restoreSession({
      status: "review",
      name: "Login",
      steps: [step(1, "https://example.com/step-001.png")],
      finalScreenshotUrl: "https://example.com/final.png"
    });

    const state = useRecordingStore.getState();
    expect(state.finalScreenshotUrl).toBe("https://example.com/final.png");
    expect(state.previewTarget).toEqual({ type: "final" });
  });

  it("selectIsEditingSavedArtifact is true only when reviewing a saved artifact", () => {
    useRecordingStore.setState({
      mode: "review",
      finalizedPath: ".vindicate/recordings/login.json"
    });
    expect(selectIsEditingSavedArtifact(useRecordingStore.getState())).toBe(true);

    useRecordingStore.setState({ finalizedPath: null });
    expect(selectIsEditingSavedArtifact(useRecordingStore.getState())).toBe(false);

    useRecordingStore.setState({
      mode: "finalized",
      finalizedPath: ".vindicate/recordings/login.json"
    });
    expect(selectIsEditingSavedArtifact(useRecordingStore.getState())).toBe(false);
  });

  it("setView(new) resets the create recording form", () => {
    useRecordingStore.setState({
      view: "dashboard",
      newForm: {
        name: "Login",
        url: "example.com/login",
        browser: "chromium",
        preconditionRecordings: ["Setup"]
      },
      isStartingRecording: true,
      playback: { status: "failed", error: "Conflict", failedStep: 0, recordingName: "" }
    });

    useRecordingStore.getState().setView("new");

    const state = useRecordingStore.getState();
    expect(state.newForm).toEqual({
      name: "",
      url: "",
      browser: "chromium",
      preconditionRecordings: []
    });
    expect(state.isStartingRecording).toBe(false);
    expect(state.playback).toEqual({ status: "idle" });
  });

  it("startLiveRecording clears the create recording form after a successful start", () => {
    useRecordingStore.setState({
      newForm: {
        name: "Login",
        url: "example.com/login",
        browser: "chromium",
        preconditionRecordings: []
      }
    });

    useRecordingStore.getState().startLiveRecording("session-1", "Login", "human", "Login");

    expect(useRecordingStore.getState().newForm.name).toBe("");
    expect(useRecordingStore.getState().newForm.url).toBe("");
  });

  it("selectEditorRecordedSteps hides entry navigate when pre-conditions were replayed", () => {
    useRecordingStore.setState({
      mode: "recording",
      preconditionRecordings: ["Setup"],
      steps: [navigateStep(1, "explicit"), step(2)]
    });

    expect(selectEditorRecordedSteps(useRecordingStore.getState()).map((s) => s.seq)).toEqual([2]);
    expect(selectEditorTimelineStepCount(useRecordingStore.getState())).toBe(2);
  });

  it("selectEditorRecordedSteps keeps implicit entry navigate when pre-conditions were replayed", () => {
    useRecordingStore.setState({
      mode: "recording",
      preconditionRecordings: ["Setup"],
      steps: [navigateStep(1, "implicit"), step(2)]
    });

    expect(selectEditorRecordedSteps(useRecordingStore.getState()).map((s) => s.seq)).toEqual([
      1, 2
    ]);
  });

  it("restoreSession restores precondition recordings for saved artifacts", () => {
    useRecordingStore.getState().restoreSession({
      status: "finalized",
      name: "Checkout",
      steps: [navigateStep(1), step(2)],
      preconditionRecordings: ["Setup", "Login"]
    });

    const state = useRecordingStore.getState();
    expect(state.preconditionRecordings).toEqual(["Setup", "Login"]);
    expect(selectEditorRecordedSteps(state).map((s) => s.seq)).toEqual([2]);
    expect(selectEditorTimelineStepCount(state)).toBe(3);
  });

  it("getTimelineStepNumber uses list index when entry navigate is hidden", () => {
    const recorded = [step(2)];
    expect(getTimelineStepNumber(2, 1, recorded)).toBe(2);
    expect(getTimelineStepNumber(2, 2, recorded)).toBe(3);
  });

  it("finalizeRecording syncs filtered renumbered steps into the store", () => {
    useRecordingStore.setState({
      mode: "review",
      sessionId: "session-1",
      sessionName: "Checkout",
      preconditionRecordings: ["Setup"],
      steps: [navigateStep(1, "explicit"), step(2), step(3)]
    });

    useRecordingStore.getState().finalizeRecording();

    const state = useRecordingStore.getState();
    expect(state.isFinalizing).toBe(true);
    expect(state.steps.map((s) => s.seq)).toEqual([1, 2]);
    expect(state.steps.every((s) => s.action !== "navigate")).toBe(true);
  });

  it("appendSteps in live mode auto-selects the latest recorded step", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [],
      previewTarget: { type: "none" }
    });

    useRecordingStore.getState().appendSteps([step(1)]);
    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 1 });

    useRecordingStore.getState().appendSteps([step(2, "https://example.com/step-002.png")]);
    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 2 });
  });

  it("appendSteps in live mode keeps selection when a screenshot arrives for the active step", () => {
    useRecordingStore.setState({
      mode: "recording",
      steps: [step(1)],
      previewTarget: { type: "step", seq: 1 }
    });

    useRecordingStore.getState().appendSteps([step(1, "https://example.com/step-001.png")]);

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 1 });
  });

  it("appendSteps in live mode skips hidden entry navigate when selecting the active step", () => {
    useRecordingStore.setState({
      mode: "recording",
      preconditionRecordings: ["Setup"],
      steps: [],
      previewTarget: { type: "none" }
    });

    useRecordingStore.getState().appendSteps([navigateStep(1, "explicit"), step(2)]);

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 2 });
  });

  it("appendSteps in review mode preserves an existing preview selection", () => {
    useRecordingStore.setState({
      mode: "review",
      steps: [step(1, "https://example.com/step-001.png")],
      previewTarget: { type: "step", seq: 1 }
    });

    useRecordingStore.getState().appendSteps([step(2, "https://example.com/step-002.png")]);

    expect(useRecordingStore.getState().previewTarget).toEqual({ type: "step", seq: 1 });
  });

  it("selectEditorRecordedSteps is reference-stable in review mode with no removals", () => {
    useRecordingStore.setState({
      mode: "review",
      removedSeqs: new Set<number>(),
      steps: [
        step(1, "https://example.com/step-001.png"),
        step(2, "https://example.com/step-002.png")
      ]
    });

    const first = selectEditorRecordedSteps(useRecordingStore.getState());
    const second = selectEditorRecordedSteps(useRecordingStore.getState());

    expect(second).toBe(first);
  });
});

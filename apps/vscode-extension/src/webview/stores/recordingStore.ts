import { create } from "zustand";

import { postToExtension } from "@/lib/bridge";
import {
  deriveTargetUrlFromSteps,
  getNavigationTrigger,
  renumberSteps
} from "@/lib/recording-formatters";
import type {
  LocatorCandidate,
  NewRecordingForm,
  PlaybackState,
  PreviewTarget,
  RecordingMode,
  RecordingSession,
  RecordingStep,
  RecordingView
} from "@/lib/recording-ui-types";

export interface RecordingState {
  readonly view: RecordingView;
  readonly sessionId: string | null;
  readonly safeName: string | null;
  readonly sessionName: string | null;
  readonly startedBy: "human" | "agent";
  readonly mode: RecordingMode;
  readonly steps: readonly RecordingStep[];
  readonly removedSeqs: ReadonlySet<number>;
  readonly openLocatorSeq: number | null;
  readonly previewTarget: PreviewTarget;
  readonly finalScreenshotUrl: string | null;
  readonly isFinalizing: boolean;
  readonly finalizeError: string | null;
  readonly discardError: string | null;
  readonly annotateFeedback: { safeName: string; error?: string } | null;
  readonly finalizedPath: string | null;
  readonly newForm: NewRecordingForm;
  readonly dashboardSessions: readonly RecordingSession[];
  readonly dashboardLoading: boolean;
  readonly dashboardError: string | null;
  readonly workerOnline: boolean;
  readonly playback: PlaybackState;
  readonly isStartingRecording: boolean;
  readonly isStopping: boolean;
  readonly isDiscarding: boolean;
  readonly sessionLoading: boolean;
  readonly sessionLoadError: string | null;
  readonly targetUrl: string | null;
  readonly preconditionRecordings: readonly string[];
  readonly projectRoot: string | null;
}

interface RecordingActions {
  setView: (view: RecordingView) => void;
  loadDashboard: () => void;
  setDashboardSessions: (entries: RecordingSession[], error?: string) => void;
  setDashboardLoading: (loading: boolean) => void;
  setWorkerOnline: (online: boolean) => void;
  startLiveRecording: (
    sessionId: string,
    name: string,
    startedBy: "human" | "agent",
    safeName: string,
    preconditionRecordings?: string[],
    projectRoot?: string
  ) => void;
  appendSteps: (steps: RecordingStep[]) => void;
  restoreSession: (payload: {
    status: "recording" | "review" | "finalized";
    steps: RecordingStep[];
    name: string;
    sessionId?: string;
    safeName?: string;
    artifactPath?: string;
    started_by?: "human" | "agent";
    finalScreenshotUrl?: string;
    preconditionRecordings?: string[];
  }) => void;
  setSessionLoadFailed: (error: string) => void;
  completeRecordingStop: (finalScreenshotUrl: string | null) => void;
  setMode: (mode: RecordingMode) => void;
  selectPreviewTarget: (target: PreviewTarget) => void;
  setOpenLocator: (seq: number | null) => void;
  chooseLocator: (seq: number, chosen: LocatorCandidate) => void;
  removeStep: (seq: number) => void;
  restoreSteps: () => void;
  updateStep: (updated: RecordingStep) => void;
  startFinalize: () => void;
  setFinalized: (path: string) => void;
  setFinalizeFailed: (error: string) => void;
  setAnnotateSucceeded: (_safeName: string) => void;
  setAnnotateFailed: (safeName: string, error: string) => void;
  updateNewForm: <K extends keyof NewRecordingForm>(key: K, value: NewRecordingForm[K]) => void;
  startRecordingFromForm: () => void;
  stopRecording: () => void;
  takeSnapshot: () => void;
  finalizeRecording: () => void;
  discardRecording: () => void;
  revertToSavedArtifact: () => void;
  deleteSavedRecording: () => void;
  resetAfterDiscard: () => void;
  setDiscardFailed: (error: string) => void;
  setPlaybackState: (
    state: PlaybackState["status"],
    detail?: Partial<Extract<PlaybackState, { status: "failed" }>> & { total?: number }
  ) => void;
  setPlaybackProgress: (current: number, total: number, recordingName: string) => void;
  openSession: (session: RecordingSession) => void;
  openArtifact: (artifactPath: string) => void;
}

const visibleStepsMemo = new WeakMap<
  readonly RecordingStep[],
  WeakMap<ReadonlySet<number>, readonly RecordingStep[]>
>();

const recordedStepsMemo = new WeakMap<
  readonly RecordingStep[],
  Map<number, readonly RecordingStep[]>
>();

export const selectVisibleSteps = (s: RecordingState): readonly RecordingStep[] => {
  if (s.mode === "recording" || s.removedSeqs.size === 0) {
    return s.steps;
  }
  let byRemoved = visibleStepsMemo.get(s.steps);
  if (byRemoved === undefined) {
    byRemoved = new WeakMap<ReadonlySet<number>, readonly RecordingStep[]>();
    visibleStepsMemo.set(s.steps, byRemoved);
  }
  const cached = byRemoved.get(s.removedSeqs);
  if (cached !== undefined) {
    return cached;
  }
  const result = s.steps.filter((st) => !s.removedSeqs.has(st.seq));
  byRemoved.set(s.removedSeqs, result);
  return result;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function isRedundantEntryNavigateStep(step: RecordingStep): boolean {
  if (step.action !== "navigate") {
    return false;
  }
  return getNavigationTrigger(step) !== "implicit";
}

/** Recorded steps shown in the editor — hides spurious entry navigate when pre-conditions were replayed. */
export const selectEditorRecordedSteps = (s: RecordingState): readonly RecordingStep[] => {
  const steps = selectVisibleSteps(s);
  if (s.preconditionRecordings.length === 0 || steps.length === 0) {
    return steps;
  }
  let byPreconditionCount = recordedStepsMemo.get(steps);
  if (byPreconditionCount === undefined) {
    byPreconditionCount = new Map<number, readonly RecordingStep[]>();
    recordedStepsMemo.set(steps, byPreconditionCount);
  }
  const preconditionCount = s.preconditionRecordings.length;
  const cached = byPreconditionCount.get(preconditionCount);
  if (cached !== undefined) {
    return cached;
  }
  if (isRedundantEntryNavigateStep(steps[0]!)) {
    const result = steps.slice(1);
    byPreconditionCount.set(preconditionCount, result);
    return result;
  }
  byPreconditionCount.set(preconditionCount, steps);
  return steps;
};

/** Total steps shown in the editor timeline (pre-condition replays + recorded steps). */
export const selectEditorTimelineStepCount = (s: RecordingState): number =>
  s.preconditionRecordings.length + selectEditorRecordedSteps(s).length;

/** Maps a recorded step seq to its display position in the editor timeline. */
export function getTimelineStepNumber(
  stepSeq: number,
  preconditionCount: number,
  recordedSteps: readonly RecordingStep[]
): number {
  const index = recordedSteps.findIndex((s) => s.seq === stepSeq);
  if (index < 0) {
    return stepSeq;
  }
  return preconditionCount + index + 1;
}

function resolvePreviewTargetAfterAppend(
  state: RecordingState,
  merged: RecordingStep[]
): PreviewTarget {
  if (state.mode === "recording") {
    const recorded = selectEditorRecordedSteps({ ...state, steps: merged });
    const lastRecorded = recorded[recorded.length - 1];
    return lastRecorded !== undefined ? { type: "step", seq: lastRecorded.seq } : { type: "none" };
  }

  if (state.previewTarget.type !== "none") {
    return state.previewTarget;
  }

  const firstWithScreenshot = merged.find((s) => s.screenshotUrl);
  return firstWithScreenshot !== undefined
    ? { type: "step", seq: firstWithScreenshot.seq }
    : state.previewTarget;
}

/** Best preview target when entering review without a live browser. */
export function resolveReviewPreviewTarget(state: RecordingState): PreviewTarget {
  if (nonEmptyString(state.finalScreenshotUrl) !== null) {
    return { type: "final" };
  }

  const recorded = selectEditorRecordedSteps(state);
  const lastWithScreenshot = [...recorded]
    .reverse()
    .find((s) => nonEmptyString(s.screenshotUrl) !== null);
  if (lastWithScreenshot !== undefined) {
    return { type: "step", seq: lastWithScreenshot.seq };
  }

  const lastRecorded = recorded[recorded.length - 1];
  if (lastRecorded !== undefined) {
    return { type: "step", seq: lastRecorded.seq };
  }

  return { type: "none" };
}

/** Reviewing edits on top of an already-saved artifact (session may be gone). */
export const selectIsEditingSavedArtifact = (s: RecordingState): boolean =>
  s.mode === "review" && s.finalizedPath !== null;

const DEFAULT_NEW_FORM: NewRecordingForm = {
  name: "",
  url: "",
  browser: "chromium",
  preconditionRecordings: []
};

function freshNewRecordingForm(): NewRecordingForm {
  return { ...DEFAULT_NEW_FORM, preconditionRecordings: [] };
}

const INITIAL: RecordingState = {
  view: "dashboard",
  sessionId: null,
  safeName: null,
  sessionName: null,
  startedBy: "human",
  mode: "recording",
  steps: [],
  removedSeqs: new Set(),
  openLocatorSeq: null,
  previewTarget: { type: "none" },
  finalScreenshotUrl: null,
  isFinalizing: false,
  finalizeError: null,
  discardError: null,
  annotateFeedback: null,
  finalizedPath: null,
  newForm: freshNewRecordingForm(),
  dashboardSessions: [],
  dashboardLoading: false,
  dashboardError: null,
  workerOnline: true,
  playback: { status: "idle" },
  isStartingRecording: false,
  isStopping: false,
  isDiscarding: false,
  sessionLoading: false,
  sessionLoadError: null,
  targetUrl: null,
  preconditionRecordings: [],
  projectRoot: null
};

export const useRecordingStore = create<RecordingState & RecordingActions>((set, get) => ({
  ...INITIAL,

  setView: (view) => {
    if (view === "new") {
      set({
        view,
        newForm: freshNewRecordingForm(),
        isStartingRecording: false,
        isStopping: false,
        playback: { status: "idle" }
      });
      return;
    }
    set({ view });
  },

  loadDashboard: () => {
    set({ dashboardLoading: true });
    postToExtension({ type: "list_recordings" });
  },

  setDashboardSessions: (entries, error) =>
    set({ dashboardSessions: entries, dashboardLoading: false, dashboardError: error ?? null }),

  setDashboardLoading: (loading) =>
    set({ dashboardLoading: loading, ...(loading ? { dashboardError: null } : {}) }),

  setWorkerOnline: (online) => set({ workerOnline: online }),

  startLiveRecording: (
    sessionId,
    name,
    startedBy,
    safeName,
    preconditionRecordings = [],
    projectRoot
  ) =>
    set({
      view: "editor",
      sessionId,
      safeName,
      sessionName: name,
      startedBy,
      targetUrl: get().newForm.url.trim() || null,
      preconditionRecordings,
      projectRoot: projectRoot ?? get().projectRoot,
      mode: "recording",
      steps: [],
      removedSeqs: new Set(),
      openLocatorSeq: null,
      previewTarget: { type: "none" },
      finalScreenshotUrl: null,
      isFinalizing: false,
      finalizeError: null,
      discardError: null,
      finalizedPath: null,
      isStartingRecording: false,
      isStopping: false,
      isDiscarding: false,
      playback: { status: "idle" },
      newForm: freshNewRecordingForm()
    }),

  appendSteps: (incoming) =>
    set((state) => {
      const merged = [...state.steps];
      for (const step of incoming) {
        const idx = merged.findIndex((s) => s.seq === step.seq);
        if (idx >= 0) {
          const existing = merged[idx]!;
          const incomingScreenshot = nonEmptyString(step.screenshotUrl);
          const existingScreenshot = nonEmptyString(existing.screenshotUrl);
          merged[idx] =
            incomingScreenshot !== null
              ? step
              : existingScreenshot !== null
                ? { ...step, screenshotUrl: existingScreenshot }
                : step;
        } else {
          merged.push(step);
        }
      }
      merged.sort((a, b) => a.seq - b.seq);
      const latestWithScreenshot = [...merged]
        .reverse()
        .find((s) => nonEmptyString(s.screenshotUrl) !== null);
      const previewTarget = resolvePreviewTargetAfterAppend(state, merged);
      const followLiveStep = state.mode === "recording" && previewTarget.type === "step";

      return {
        steps: merged,
        previewTarget,
        ...(followLiveStep ? { openLocatorSeq: null } : {}),
        finalScreenshotUrl:
          state.mode === "recording"
            ? (latestWithScreenshot?.screenshotUrl ?? state.finalScreenshotUrl)
            : state.finalScreenshotUrl
      };
    }),

  restoreSession: ({
    status,
    steps,
    name,
    sessionId,
    safeName,
    artifactPath,
    started_by,
    finalScreenshotUrl: restoredFinalScreenshotUrl,
    preconditionRecordings = []
  }) => {
    const firstWithScreenshot = steps.find((s) => nonEmptyString(s.screenshotUrl) !== null);
    const lastWithScreenshot = [...steps]
      .reverse()
      .find((s) => nonEmptyString(s.screenshotUrl) !== null);
    const finalScreenshotUrl =
      nonEmptyString(restoredFinalScreenshotUrl) ??
      lastWithScreenshot?.screenshotUrl ??
      firstWithScreenshot?.screenshotUrl ??
      null;
    const derivedTargetUrl = deriveTargetUrlFromSteps(steps);
    const base = {
      view: "editor" as const,
      sessionName: name,
      steps,
      preconditionRecordings,
      removedSeqs: new Set<number>(),
      openLocatorSeq: null,
      sessionLoading: false,
      sessionLoadError: null,
      isStopping: false,
      isFinalizing: false,
      finalizeError: null,
      discardError: null,
      targetUrl: derivedTargetUrl.length > 0 ? derivedTargetUrl : null,
      finalScreenshotUrl,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(safeName !== undefined ? { safeName } : {}),
      ...(started_by !== undefined ? { startedBy: started_by } : {})
    };
    if (status === "finalized") {
      const finalizedState: RecordingState = {
        ...INITIAL,
        ...base,
        mode: "finalized",
        finalizedPath: artifactPath ?? null
      };
      return set({
        ...finalizedState,
        previewTarget: resolveReviewPreviewTarget(finalizedState)
      });
    }
    const restored: RecordingState = {
      ...INITIAL,
      ...base,
      mode: status === "recording" ? "recording" : "review",
      finalizedPath: null
    };
    return set({
      ...restored,
      mode: status,
      previewTarget:
        status === "recording"
          ? { type: "none" }
          : resolveReviewPreviewTarget({ ...restored, mode: "review" })
    });
  },

  setSessionLoadFailed: (error) =>
    set({ sessionLoading: false, sessionLoadError: error, isStopping: false }),

  completeRecordingStop: (incomingFinalUrl) =>
    set((state) => {
      const finalScreenshotUrl =
        nonEmptyString(incomingFinalUrl) ?? nonEmptyString(state.finalScreenshotUrl);
      return {
        mode: "review",
        finalScreenshotUrl,
        previewTarget: resolveReviewPreviewTarget({ ...state, mode: "review", finalScreenshotUrl }),
        openLocatorSeq: null,
        isStopping: false
      };
    }),

  setMode: (mode) =>
    set((state) => ({
      mode,
      previewTarget:
        mode === "recording"
          ? { type: "none" }
          : mode === "review"
            ? resolveReviewPreviewTarget({ ...state, mode: "review" })
            : nonEmptyString(state.finalScreenshotUrl) !== null
              ? { type: "final" }
              : resolveReviewPreviewTarget({ ...state, mode: "review" }),
      openLocatorSeq: null,
      isStopping: mode === "recording" ? state.isStopping : false
    })),

  selectPreviewTarget: (target) => set({ previewTarget: target }),

  setOpenLocator: (seq) => set({ openLocatorSeq: seq }),

  chooseLocator: (seq, chosen) =>
    set((state) => ({
      steps: state.steps.map((s) => (s.seq === seq ? { ...s, chosen } : s))
    })),

  removeStep: (seq) =>
    set((state) => ({
      removedSeqs: new Set([...state.removedSeqs, seq])
    })),

  restoreSteps: () => set({ removedSeqs: new Set() }),

  updateStep: (updated) =>
    set((state) => ({
      steps: state.steps.map((s) => (s.seq === updated.seq ? updated : s))
    })),

  startFinalize: () => set({ isFinalizing: true, finalizeError: null }),

  setFinalized: (path) =>
    set((state) => ({
      isFinalizing: false,
      mode: "finalized",
      finalizedPath: path,
      previewTarget: resolveReviewPreviewTarget({ ...state, mode: "finalized" })
    })),

  setFinalizeFailed: (error) =>
    set({
      isFinalizing: false,
      finalizeError: error
    }),

  setAnnotateSucceeded: () => set({ annotateFeedback: null }),

  setAnnotateFailed: (safeName, error) => set({ annotateFeedback: { safeName, error } }),

  updateNewForm: (key, value) =>
    set((state) => ({
      newForm: { ...state.newForm, [key]: value }
    })),

  startRecordingFromForm: () => {
    const { newForm } = get();
    set({ isStartingRecording: true, playback: { status: "idle" } });
    postToExtension({
      type: "start_recording",
      name: newForm.name,
      targetUrl: newForm.url,
      preconditionRecordings: newForm.preconditionRecordings
    });
  },

  stopRecording: () => {
    const { sessionId, mode } = get();
    if (sessionId === null || mode !== "recording") {
      return;
    }
    set({ isStopping: true });
    postToExtension({ type: "stop_recording", sessionId });
  },

  takeSnapshot: () => {
    const { sessionId, mode } = get();
    if (sessionId === null || mode !== "recording") {
      return;
    }
    postToExtension({ type: "take_snapshot", sessionId });
  },

  finalizeRecording: () => {
    const state = get();
    const visible = selectEditorRecordedSteps(state);
    const edited = renumberSteps([...visible]);
    set({ steps: edited, isFinalizing: true, finalizeError: null });
    postToExtension({
      type: "finalize",
      steps: edited,
      name: state.sessionName ?? "",
      ...(state.sessionId !== null ? { sessionId: state.sessionId } : {}),
      ...(state.safeName !== null ? { safeName: state.safeName } : {})
    });
  },

  discardRecording: () => {
    const { sessionId } = get();
    if (sessionId === null) {
      return;
    }
    set({ isDiscarding: true, discardError: null });
    postToExtension({ type: "discard", sessionId });
  },

  revertToSavedArtifact: () => {
    const { safeName, sessionName, sessionId, finalizedPath, startedBy } = get();
    if (safeName === null || finalizedPath === null) {
      return;
    }
    set({ sessionLoading: true, discardError: null, isDiscarding: false });
    postToExtension({
      type: "load_recording_session",
      sessionId: sessionId ?? safeName,
      safeName,
      name: sessionName ?? safeName,
      status: "finalized",
      artifactPath: finalizedPath,
      started_by: startedBy
    });
  },

  deleteSavedRecording: () => {
    const { safeName, projectRoot } = get();
    if (safeName === null) {
      return;
    }
    set({ isDiscarding: true, discardError: null });
    postToExtension({
      type: "delete_recording",
      safeName,
      ...(projectRoot !== null ? { projectRoot } : {})
    });
  },

  resetAfterDiscard: () => {
    set({ ...INITIAL, view: "dashboard", newForm: freshNewRecordingForm() });
    get().loadDashboard();
  },

  setDiscardFailed: (error) => set({ isDiscarding: false, discardError: error }),

  setPlaybackState: (status, detail) => {
    if (status === "running") {
      set({ playback: { status: "running", total: detail?.total ?? 0 } });
      return;
    }
    if (status === "failed") {
      set({
        isStartingRecording: false,
        playback: {
          status: "failed",
          error: detail?.error ?? "Playback failed",
          failedStep: detail?.failedStep ?? 0,
          recordingName: detail?.recordingName ?? ""
        }
      });
      return;
    }
    if (status === "done") {
      set({ playback: { status: "done" } });
      return;
    }
    set({ playback: { status: "idle" } });
  },

  setPlaybackProgress: (current, total, recordingName) =>
    set({ playback: { status: "running", total, current, recordingName } }),

  openSession: (session) => {
    set({
      view: "editor",
      sessionId: session.status === "finalized" ? null : session.id,
      safeName: session.safeName,
      sessionName: session.name,
      startedBy: session.started_by,
      targetUrl: session.targetUrl.trim().length > 0 ? session.targetUrl.trim() : null,
      mode: session.status,
      steps: [],
      removedSeqs: new Set(),
      openLocatorSeq: null,
      previewTarget: { type: "none" },
      finalScreenshotUrl: null,
      isFinalizing: false,
      finalizeError: null,
      discardError: null,
      finalizedPath: session.artifactPath ?? null,
      sessionLoading: true,
      sessionLoadError: null,
      isStopping: false,
      isDiscarding: false,
      playback: { status: "idle" }
    });
    postToExtension({
      type: "load_recording_session",
      sessionId: session.id,
      safeName: session.safeName,
      name: session.name,
      status: session.status,
      started_by: session.started_by,
      ...(session.artifactPath !== undefined ? { artifactPath: session.artifactPath } : {})
    });
  },

  openArtifact: (artifactPath) => {
    postToExtension({ type: "open_recording", artifactPath });
  }
}));

import { useEffect } from "react";

import { onExtensionMessage } from "@/lib/bridge";
import { normalizeRecordingStep } from "@/lib/recording-formatters";
import type { RecordingSession, RecordingStep } from "@/lib/recording-ui-types";
import { useRecordingStore } from "@/stores/recordingStore";
import { Dashboard } from "@/components/recording/dashboard/Dashboard";
import { NewRecordingForm } from "@/components/recording/new-recording/NewRecordingForm";
import { RecordingEditor } from "@/components/recording/editor/RecordingEditor";

export function RecordingSurface() {
  const view = useRecordingStore((s) => s.view);
  const loadDashboard = useRecordingStore((s) => s.loadDashboard);

  useEffect(() => {
    loadDashboard();
    return onExtensionMessage((msg) => {
      const store = useRecordingStore.getState();
      switch (msg.type) {
        case "recording_started":
          store.startLiveRecording(
            msg.sessionId,
            msg.name,
            msg.started_by,
            msg.safeName,
            msg.preconditionRecordings ?? [],
            msg.projectRoot
          );
          break;
        case "recording_steps_batch":
          store.appendSteps((msg.steps as RecordingStep[]).map(normalizeRecordingStep));
          break;
        case "recording_show_dashboard":
          store.setView("dashboard");
          store.loadDashboard();
          break;
        case "recording_stopped":
          store.completeRecordingStop(msg.finalScreenshotUrl ?? null);
          break;
        case "recording_finalized":
          store.setFinalized(msg.path);
          break;
        case "recording_finalize_failed":
          store.setFinalizeFailed(msg.error);
          break;
        case "recording_discarded":
          store.resetAfterDiscard();
          break;
        case "recording_discard_failed":
          store.setDiscardFailed(msg.error);
          break;
        case "recording_restored":
          store.restoreSession({
            status: msg.status,
            steps: (msg.steps as RecordingStep[]).map(normalizeRecordingStep),
            name: msg.name,
            ...(msg.sessionId !== undefined ? { sessionId: msg.sessionId } : {}),
            ...(msg.safeName !== undefined ? { safeName: msg.safeName } : {}),
            ...(msg.artifactPath !== undefined ? { artifactPath: msg.artifactPath } : {}),
            ...(msg.started_by !== undefined ? { started_by: msg.started_by } : {}),
            ...(msg.finalScreenshotUrl !== undefined ? { finalScreenshotUrl: msg.finalScreenshotUrl } : {}),
            ...(msg.preconditionRecordings !== undefined
              ? { preconditionRecordings: msg.preconditionRecordings }
              : {})
          });
          break;
        case "recording_load_failed":
          store.setSessionLoadFailed(msg.error);
          break;
        case "recordings_list":
          store.setDashboardSessions(msg.entries as RecordingSession[], msg.error);
          break;
        case "playback_started":
          store.setPlaybackState("running", { total: msg.total });
          break;
        case "playback_progress":
          store.setPlaybackProgress(msg.current, msg.total, msg.recordingName);
          break;
        case "playback_failed":
          store.setPlaybackState("failed", msg);
          break;
        case "playback_complete":
          store.setPlaybackState("done");
          break;
        case "worker_status":
          store.setWorkerOnline(msg.online);
          break;
        case "annotate_succeeded":
          store.setAnnotateSucceeded(msg.safeName);
          break;
        case "annotate_failed":
          store.setAnnotateFailed(msg.safeName, msg.error);
          break;
        case "health:status":
          store.setWorkerOnline(msg.runtime === "up");
          break;
        default:
          break;
      }
    });
  }, [loadDashboard]);

  if (view === "dashboard") return <Dashboard />;
  if (view === "new") return <NewRecordingForm />;
  return <RecordingEditor />;
}

import {
  ArrowLeft,
  Camera,
  Square,
  Check,
  RotateCw,
  Sparkles,
  FileJson,
  Loader2,
  ClipboardList
} from "lucide-react";
import { useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/recording/ui/Button";
import { CopyButton } from "@/components/recording/ui/CopyButton";
import { ConfirmDialog } from "@/components/recording/ui/ConfirmDialog";
import { SnapshotHint } from "@/components/recording/shared/SnapshotHint";
import { StatusBadge } from "@/components/recording/shared/StatusBadge";
import { StepList } from "./StepList";
import { PreviewPane } from "@/components/recording/preview/PreviewPane";
import { GenerateTestModal } from "@/components/recording/editor/GenerateTestModal";
import { GenerateRequirementsModal } from "@/components/recording/editor/GenerateRequirementsModal";
import {
  useRecordingStore,
  selectEditorRecordedSteps,
  selectEditorTimelineStepCount,
  selectIsEditingSavedArtifact
} from "@/stores/recordingStore";

const LAYOUT_KEY = "vindicate-editor-layout";

export function RecordingEditor() {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: LAYOUT_KEY,
    storage: localStorage,
    onlySaveAfterUserInteractions: true
  });

  // Batch state subscriptions
  const {
    mode,
    isFinalizing,
    finalizeError,
    discardError,
    isDiscarding,
    finalizedPath,
    sessionName,
    sessionLoading,
    sessionLoadError,
    startedBy,
    preconditionRecordings,
    projectRoot,
    isStopping
  } = useRecordingStore(
    useShallow((s) => ({
      mode: s.mode,
      isFinalizing: s.isFinalizing,
      finalizeError: s.finalizeError,
      discardError: s.discardError,
      isDiscarding: s.isDiscarding,
      finalizedPath: s.finalizedPath,
      sessionName: s.sessionName,
      sessionLoading: s.sessionLoading,
      sessionLoadError: s.sessionLoadError,
      startedBy: s.startedBy,
      preconditionRecordings: s.preconditionRecordings,
      projectRoot: s.projectRoot,
      isStopping: s.isStopping
    }))
  );
  // Derived scalar — avoids subscribing to the full Set
  const removedCount = useRecordingStore((s) => s.removedSeqs.size);
  const isEditingSavedArtifact = useRecordingStore(selectIsEditingSavedArtifact);
  const timelineStepCount = useRecordingStore(selectEditorTimelineStepCount);
  const keptStepCount = useRecordingStore((s) => selectEditorRecordedSteps(s).length);

  // Batch action subscriptions — actions are stable references but grouping is cleaner
  const {
    setView,
    setMode,
    stopRecording,
    takeSnapshot,
    finalizeRecording,
    discardRecording,
    revertToSavedArtifact,
    deleteSavedRecording,
    restoreSteps
  } = useRecordingStore(
    useShallow((s) => ({
      setView: s.setView,
      setMode: s.setMode,
      stopRecording: s.stopRecording,
      takeSnapshot: s.takeSnapshot,
      finalizeRecording: s.finalizeRecording,
      discardRecording: s.discardRecording,
      revertToSavedArtifact: s.revertToSavedArtifact,
      deleteSavedRecording: s.deleteSavedRecording,
      restoreSteps: s.restoreSteps
    }))
  );

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showBackToReviewConfirm, setShowBackToReviewConfirm] = useState(false);
  const [showGenerateTest, setShowGenerateTest] = useState(false);
  const [showGenerateRequirements, setShowGenerateRequirements] = useState(false);

  const title = sessionName ?? "Recording";

  return (
    <div className="flex h-full flex-col bg-vs-bg">
      {/* Screen-reader announcements for dynamic state changes */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {mode === "recording" &&
          `${timelineStepCount} step${timelineStepCount === 1 ? "" : "s"} captured`}
        {isFinalizing && "Finalizing recording, please wait."}
        {mode === "finalized" && !isFinalizing && "Recording finalized. Artifact is ready."}
      </span>
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4 border-b border-vs-border bg-vs-surface backdrop-blur-sm">
        <div className="flex flex-col items-start min-w-0">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className="mb-1.5 inline-flex items-center gap-2 bg-transparent border-0 cursor-pointer text-[10px] font-mono uppercase tracking-[0.14em] text-vs-text-dim hover:text-vs-text transition-colors"
          >
            <ArrowLeft size={12} /> Recordings
          </button>
          <h1 className="flex flex-wrap items-center gap-3 text-ui-display font-semibold tracking-tight leading-tight m-0">
            {title}
            <StatusBadge status={mode} pulse={mode === "recording"} />
            {startedBy === "agent" && (
              <span className="rounded-md border border-tone-violet/30 bg-tone-violet/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-tone-violet">
                Agent recorded
              </span>
            )}
          </h1>
          {preconditionRecordings.length > 0 && (
            <p className="mt-1 text-[12px] text-vs-text-dim">
              Pre-conditions: {preconditionRecordings.join(" → ")} (replayed before recording)
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-vs-text-dim">
            {mode === "recording" && (
              <>
                <span>
                  {timelineStepCount} step{timelineStepCount === 1 ? "" : "s"} captured
                </span>
                <span
                  aria-hidden="true"
                  className="w-1 h-1 rounded-full bg-vs-text-dim opacity-50"
                />
                <span>interacting in headed browser</span>
              </>
            )}
            {mode === "review" && (
              <>
                <span>{timelineStepCount} steps</span>
                <span
                  aria-hidden="true"
                  className="w-1 h-1 rounded-full bg-vs-text-dim opacity-50"
                />
                <span>edit locators &amp; trim before finalize</span>
              </>
            )}
            {mode === "finalized" && (
              <>
                <span>{timelineStepCount} steps</span>
                <span
                  aria-hidden="true"
                  className="w-1 h-1 rounded-full bg-vs-text-dim opacity-50"
                />
                <span>artifact ready for codegen</span>
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === "recording" && (
            <>
              <span className="inline-flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => takeSnapshot()}
                  disabled={isStopping}
                >
                  <Camera size={13} /> Snapshot
                </Button>
                <SnapshotHint />
              </span>
              <Button
                variant="primary"
                size="md"
                disabled={isStopping}
                className="!bg-tone-red !border-tone-red"
                onClick={() => stopRecording()}
              >
                {isStopping ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Stopping…
                  </>
                ) : (
                  <>
                    <Square size={13} /> Stop
                  </>
                )}
              </Button>
            </>
          )}
          {mode === "review" && (
            <>
              <Button
                variant="ghost"
                size="md"
                disabled={isDiscarding}
                onClick={() => setShowDiscardConfirm(true)}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={isFinalizing}
                onClick={finalizeRecording}
              >
                {isFinalizing ? (
                  <>
                    <RotateCw size={13} className="animate-spin" /> Finalizing…
                  </>
                ) : (
                  <>
                    <Check size={13} /> Finalize recording
                  </>
                )}
              </Button>
            </>
          )}
          {mode === "finalized" && (
            <>
              <CopyButton text={finalizedPath ?? ""} label="Copy path" size="md" iconSize={13} />
              <Button variant="ghost" size="md" onClick={() => setShowGenerateRequirements(true)}>
                <ClipboardList size={13} /> Generate requirements
              </Button>
              <Button variant="primary" size="md" onClick={() => setShowGenerateTest(true)}>
                <Sparkles size={13} /> Generate test
              </Button>
            </>
          )}
        </div>
      </header>

      {sessionLoadError !== null && (
        <div className="mx-6 mt-3 rounded-lg border border-tone-red/40 bg-tone-red/10 px-4 py-3 text-ui-md text-tone-red">
          {sessionLoadError}
        </div>
      )}

      {sessionLoading && (
        <div
          className="mx-6 mt-3 rounded-lg border border-vs-border bg-vs-hover px-4 py-3 text-ui-md text-vs-text-dim"
          role="status"
          aria-live="polite"
        >
          Loading recording…
        </div>
      )}

      {isStopping && mode === "recording" && (
        <div
          className="mx-6 mt-3 rounded-lg border border-vs-border bg-vs-hover px-4 py-3 text-ui-md text-vs-text-dim"
          role="status"
          aria-live="polite"
        >
          Stopping recording and preparing review…
        </div>
      )}

      {finalizeError !== null && mode === "review" && (
        <div className="mx-6 mt-3 rounded-lg border border-tone-red/40 bg-tone-red/10 px-4 py-3 text-ui-md text-tone-red">
          {finalizeError}
        </div>
      )}

      {discardError !== null && (
        <div className="mx-6 mt-3 rounded-lg border border-tone-red/40 bg-tone-red/10 px-4 py-3 text-ui-md text-tone-red">
          {discardError}
        </div>
      )}

      {isDiscarding && (
        <div
          className="mx-6 mt-3 rounded-lg border border-vs-border bg-vs-hover px-4 py-3 text-ui-md text-vs-text-dim"
          role="status"
          aria-live="polite"
        >
          Deleting recording…
        </div>
      )}

      {/* ── Two-column body ── */}
      <Group
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <Panel
          id="steps"
          defaultSize="35"
          minSize="22"
          maxSize="55"
          className="flex flex-col min-h-0 overflow-hidden"
        >
          <div className="shrink-0 px-5 pt-4 pb-3 border-b border-vs-border">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight">
              {mode === "recording" && "Steps"}
              {mode === "review" && (
                <>
                  Review your steps
                  <span className="rounded-full bg-tone-red/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-tone-red">
                    editable
                  </span>
                </>
              )}
              {mode === "finalized" && "Recorded steps"}
            </div>
            <p className="mt-0.5 text-[11.5px] text-vs-text-dim leading-snug max-w-[460px]">
              {mode === "recording" &&
                "Each interaction is captured with a screenshot and selector candidates."}
              {mode === "review" &&
                "Choose the most stable locator, remove unwanted steps, then finalize when ready."}
              {mode === "finalized" &&
                "Read-only. Every step references the locator you confirmed."}
            </p>
          </div>

          {mode === "finalized" && (
            <div className="shrink-0 mx-5 mt-4 flex items-center gap-3 rounded-xl border border-tone-emerald/30 bg-tone-emerald/10 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tone-emerald text-white">
                <Check size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-ui-md font-semibold">Recording saved</p>
                <p className="text-[11.5px] text-vs-text-dim mt-0.5">
                  Artifact saved. Your agent can now generate tests from it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBackToReviewConfirm(true)}
                className="shrink-0 rounded-lg border border-vs-border bg-transparent px-2.5 py-1.5 text-[11px] text-vs-text-dim cursor-pointer hover:text-vs-text hover:border-vs-border/80 transition-colors duration-150"
              >
                Back to review
              </button>
            </div>
          )}

          <StepList mode={mode} />

          {mode === "finalized" && finalizedPath !== null && (
            <div className="shrink-0 mx-5 mb-5 flex items-center gap-2.5 rounded-lg border border-vs-border bg-vs-hover px-3 py-2.5">
              <FileJson size={14} className="shrink-0 text-vs-text-dim" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-vs-text">
                {finalizedPath}
              </span>
              <CopyButton text={finalizedPath} />
            </div>
          )}
        </Panel>

        {/* Drag handle */}
        <Separator
          aria-label="Resize panels"
          className="group relative w-px shrink-0 cursor-col-resize bg-vs-border hover:bg-vs-accent/40 active:bg-vs-accent transition-colors duration-150"
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          >
            <div className="h-1 w-1 rounded-full bg-vs-text-dim" />
            <div className="h-1 w-1 rounded-full bg-vs-text-dim" />
            <div className="h-1 w-1 rounded-full bg-vs-text-dim" />
          </div>
        </Separator>

        {/* RIGHT — preview */}
        <Panel
          id="preview"
          defaultSize="65"
          minSize="35"
          className="flex flex-col min-h-0 overflow-hidden"
        >
          <PreviewPane mode={mode} />
        </Panel>
      </Group>

      {/* ── Sticky footer ── */}
      <footer className="sticky bottom-0 z-10 flex items-center gap-3 px-6 py-2.5 border-t border-vs-border bg-vs-surface backdrop-blur-sm text-ui-sm font-mono text-vs-text-dim">
        {mode === "recording" && (
          <>
            <StatusBadge status="recording" pulse />
            <span>{timelineStepCount} steps · screenshots on · snapshots on</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => takeSnapshot()} disabled={isStopping}>
              <Camera size={12} /> Snapshot page state
            </Button>
          </>
        )}
        {mode === "review" && (
          <>
            <span>
              Saves to{" "}
              <code className="text-vs-text text-ui-sm">
                vindicate/recordings/login-record.record.json
              </code>
            </span>
            <span className="flex-1" />
            <span>
              {removedCount} removed · {keptStepCount} kept
            </span>
            {removedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={restoreSteps}>
                Restore all
              </Button>
            )}
          </>
        )}
        {mode === "finalized" && (
          <>
            <StatusBadge status="finalized" />
            <span>vindicate/recordings/login-record.record.json · {timelineStepCount} steps</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setView("dashboard")}>
              <ArrowLeft size={12} /> All recordings
            </Button>
          </>
        )}
      </footer>

      {showDiscardConfirm && isEditingSavedArtifact && (
        <ConfirmDialog
          title="Discard your edits?"
          message="Your saved recording stays on disk. This reverts locator changes and removed steps back to the last finalized version."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          secondaryLabel={isDiscarding ? "Deleting…" : "Delete recording"}
          secondaryDanger
          onConfirm={() => {
            setShowDiscardConfirm(false);
            revertToSavedArtifact();
          }}
          onSecondary={() => {
            if (isDiscarding) {
              return;
            }
            setShowDiscardConfirm(false);
            deleteSavedRecording();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

      {showDiscardConfirm && !isEditingSavedArtifact && (
        <ConfirmDialog
          title="Discard this recording?"
          message="All captured steps, screenshots, and locator edits will be permanently deleted."
          confirmLabel={isDiscarding ? "Discarding…" : "Discard"}
          danger
          onConfirm={() => {
            if (isDiscarding) {
              return;
            }
            setShowDiscardConfirm(false);
            discardRecording();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

      {showBackToReviewConfirm && (
        <ConfirmDialog
          title="Back to review?"
          message="The saved artifact will be replaced when you re-finalize. Any agent currently using it may get unexpected results."
          confirmLabel="Back to review"
          cancelLabel="Keep finalized"
          onConfirm={() => {
            setShowBackToReviewConfirm(false);
            setMode("review");
          }}
          onCancel={() => setShowBackToReviewConfirm(false)}
        />
      )}

      {showGenerateTest && finalizedPath !== null && (
        <GenerateTestModal
          path={finalizedPath}
          name={sessionName ?? "Recording"}
          isAgentRecorded={startedBy === "agent"}
          projectRoot={projectRoot ?? "."}
          onClose={() => setShowGenerateTest(false)}
        />
      )}

      {showGenerateRequirements && finalizedPath !== null && (
        <GenerateRequirementsModal
          path={finalizedPath}
          name={sessionName ?? "Recording"}
          projectRoot={projectRoot ?? "."}
          onClose={() => setShowGenerateRequirements(false)}
        />
      )}
    </div>
  );
}

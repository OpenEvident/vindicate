import { useState } from "react";
import { Eye, Monitor } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { BrowserBar } from "./BrowserBar";
import { useRecordingStore, getTimelineStepNumber, selectEditorRecordedSteps } from "@/stores/recordingStore";
import { getTargetLabel, resolvePreviewUrl } from "@/lib/recording-formatters";
import { ACTION_META } from "@/lib/recording-constants";
import type { RecordingMode, RecordingStep } from "@/lib/recording-ui-types";
import type { PreviewTarget } from "@/lib/recording-ui-types";

interface PreviewPaneProps {
  readonly mode: RecordingMode;
}

function previewTitle(target: PreviewTarget, timelineStepNumber: number | null): string {
  if (target.type === "final") return "Final capture";
  if (target.type === "step" && timelineStepNumber !== null) return `Step ${timelineStepNumber}`;
  return "Browser preview";
}

function previewHint(target: PreviewTarget, mode: RecordingMode): string {
  if (mode === "recording")    return "Live view of the page under test.";
  if (target.type === "final") return "Full-page snapshot taken when you stopped recording.";
  if (target.type === "step")  return "Screenshot captured immediately after this interaction.";
  return "Select a step or final capture to preview.";
}

interface PreviewSlice {
  previewTarget: PreviewTarget;
  screenshotUrl: string | null;
  captionStep: RecordingStep | undefined;
  steps: readonly RecordingStep[];
  recordedSteps: readonly RecordingStep[];
  preconditionCount: number;
  targetUrl: string | null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

export function PreviewPane({ mode }: PreviewPaneProps) {
  const { previewTarget, screenshotUrl, captionStep, steps, recordedSteps, preconditionCount, targetUrl } =
    useRecordingStore(
      useShallow((s): PreviewSlice => {
        const recorded = selectEditorRecordedSteps(s);
        const pt = s.previewTarget;
        if (pt.type === "final") {
          const finalUrl = nonEmptyString(s.finalScreenshotUrl);
          return {
            previewTarget: pt,
            screenshotUrl: finalUrl,
            captionStep: undefined,
            steps: s.steps,
            recordedSteps: recorded,
            preconditionCount: s.preconditionRecordings.length,
            targetUrl: s.targetUrl
          };
        }
        if (pt.type === "step") {
          const step = s.steps.find((st) => st.seq === pt.seq);
          const stepUrl = nonEmptyString(step?.screenshotUrl);
          return {
            previewTarget: pt,
            screenshotUrl: stepUrl,
            captionStep: step,
            steps: s.steps,
            recordedSteps: recorded,
            preconditionCount: s.preconditionRecordings.length,
            targetUrl: s.targetUrl
          };
        }
        return {
          previewTarget: pt,
          screenshotUrl: null,
          captionStep: undefined,
          steps: s.steps,
          recordedSteps: recorded,
          preconditionCount: s.preconditionRecordings.length,
          targetUrl: s.targetUrl
        };
      })
    );

  const previewUrl = resolvePreviewUrl(previewTarget, captionStep, steps, targetUrl);

  const isLive = mode === "recording";

  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = screenshotUrl !== null && failedUrl === screenshotUrl;
  const imageLoaded = screenshotUrl !== null && loadedUrl === screenshotUrl && !imageFailed;

  const timelineStepNumber =
    captionStep !== undefined
      ? getTimelineStepNumber(captionStep.seq, preconditionCount, recordedSteps)
      : null;

  const captionText = captionStep !== undefined
    ? `Step ${timelineStepNumber} · ${ACTION_META[captionStep.action].label} · ${getTargetLabel(captionStep)}`
    : previewTarget.type === "final"
    ? "Final capture · full page snapshot"
    : null;

  const showEmpty = isLive && previewTarget.type === "none";

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
      {/* Column header */}
      <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-vs-border">
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight">
            {previewTitle(previewTarget, timelineStepNumber)}
            <span className={[
              "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]",
              isLive
                ? "bg-tone-red/15 text-tone-red"
                : "bg-tone-emerald/15 text-tone-emerald",
            ].join(" ")}>
              {isLive ? "Live" : "Stopped"}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-vs-text-dim">
            {previewHint(previewTarget, mode)}
          </p>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto p-5 min-h-0">
        <div className="rounded-xl overflow-hidden border border-vs-border shadow-[0_20px_50px_-24px_rgba(0,0,0,0.6)] bg-vs-screenshot">
          <BrowserBar url={previewUrl} mode={mode} />

          {/* Screenshot frame — fixed aspect; image scales to fit without cropping */}
          <div className="relative aspect-[16/10.4] flex items-center justify-center overflow-hidden bg-vs-screenshot">
            {showEmpty ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-vs-text-dim">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-vs-hover/50">
                  <Monitor size={22} />
                </span>
                <span className="text-ui-md font-medium text-vs-text">Waiting for the first action</span>
                <span className="max-w-[280px] text-[11.5px] leading-relaxed">
                  Interact with the browser. Actions show up here as you go.
                </span>
              </div>
            ) : screenshotUrl !== null && !imageFailed ? (
              <>
                {/* Shimmer skeleton — visible until image finishes loading */}
                {!imageLoaded && (
                  <div className="absolute inset-0 animate-shimmer bg-vs-hover" />
                )}
                <img
                  src={screenshotUrl}
                  alt={captionText ?? "Step screenshot"}
                  onLoad={() => {
                    setLoadedUrl(screenshotUrl);
                    setFailedUrl((prev) => (prev === screenshotUrl ? null : prev));
                  }}
                  onError={() => setFailedUrl(screenshotUrl)}
                  className={[
                    "max-h-full max-w-full object-contain",
                    "transition-opacity duration-300",
                    imageLoaded ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-ui-base text-vs-text-dim p-6 text-center">
                {previewTarget.type === "step"
                  ? "This step has no screenshot."
                  : previewTarget.type === "final"
                  ? "Final screenshot not available."
                  : "No preview yet"}
              </div>
            )}
          </div>

          {/* Footer caption */}
          {captionText !== null && !showEmpty && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-vs-border bg-vs-surface-dim text-[11.5px] text-vs-text-dim">
              <Eye size={12} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{captionText}</span>
              {previewTarget.type === "step" && captionStep?.screenshotUrl !== undefined && (
                <span className="shrink-0 rounded-full border border-vs-border bg-vs-hover/50 px-1.5 font-mono text-[9.5px]">
                  screenshot ✓
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

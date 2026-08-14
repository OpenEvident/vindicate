import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { StepNode } from "./StepNode";
import { StepCard } from "./StepCard";
import { WaitingRow } from "./WaitingRow";
import { FinalCaptureCard } from "./FinalCaptureCard";
import { PreconditionReplayStep } from "./PreconditionReplayStep";
import { useRecordingStore, selectEditorRecordedSteps } from "@/stores/recordingStore";
import type { RecordingMode } from "@/lib/recording-ui-types";

interface StepListProps {
  readonly mode: RecordingMode;
}

export function StepList({ mode }: StepListProps) {
  const preconditionRecordings = useRecordingStore((s) => s.preconditionRecordings);
  const recordedSteps = useRecordingStore(useShallow(selectEditorRecordedSteps));
  const previewTarget = useRecordingStore((s) => s.previewTarget);
  const openLocatorSeq = useRecordingStore((s) => s.openLocatorSeq);
  const listRef      = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const hasPreconditions = preconditionRecordings.length > 0;

  // Scroll to bottom only when a new step is appended during live recording
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = recordedSteps.length;
    if (mode === "recording" && recordedSteps.length > prev && listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [mode, recordedSteps.length]);

  // Scroll selected step into view
  useEffect(() => {
    if (previewTarget.type !== "step") return;
    const el = listRef.current?.querySelector(`[data-step-seq="${previewTarget.seq}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [previewTarget]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 p-5 space-y-0">
      {recordedSteps.length === 0 && !hasPreconditions && mode === "recording" && (
        <p className="text-ui-base text-vs-text-dim py-4">
          Steps will appear here as you interact with the browser.
        </p>
      )}

      {preconditionRecordings.map((name, index) => {
        const showConnector = index < preconditionRecordings.length - 1 || recordedSteps.length > 0 || mode === "recording";
        return (
          <PreconditionReplayStep
            key={`precondition-${name}-${index}`}
            index={index + 1}
            name={name}
            showConnector={showConnector}
          />
        );
      })}

      {recordedSteps.map((step, index) => {
        const isLast   = index === recordedSteps.length - 1;
        const selected = previewTarget.type === "step" && previewTarget.seq === step.seq;
        const displaySeq = hasPreconditions ? preconditionRecordings.length + index + 1 : step.seq;

        return (
          <div
            key={step.seq}
            data-step-seq={step.seq}
            className="flex gap-3.5"
            style={{ paddingBottom: isLast && mode !== "recording" ? 0 : 12 }}
          >
            <StepNode
              seq={displaySeq}
              action={step.action}
              hasScreenshot={step.screenshotUrl !== undefined}
              selected={selected}
              isLast={isLast && mode !== "recording"}
            />
            <div className="min-w-0 flex-1 pb-1">
              <StepCard
                step={step}
                mode={mode}
                selected={selected}
                isLocatorOpen={openLocatorSeq === step.seq}
              />
            </div>
          </div>
        );
      })}

      {mode === "recording" && <WaitingRow />}
      {mode !== "recording" && <FinalCaptureCard />}
    </div>
  );
}

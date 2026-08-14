import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Layers, X } from "lucide-react";

import { Button } from "@/components/recording/ui/Button";
import { SessionThumb } from "@/components/recording/dashboard/SessionThumb";
import type { RecordingSession } from "@/lib/recording-ui-types";

interface PreconditionSelectModalProps {
  readonly sessions: readonly RecordingSession[];
  readonly excludedNames: readonly string[];
  readonly onDone: (names: string[]) => void;
  readonly onCancel: () => void;
}

export function PreconditionSelectModal({
  sessions,
  excludedNames,
  onDone,
  onCancel
}: PreconditionSelectModalProps) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<string[]>([]);

  const available = useMemo(
    () =>
      sessions.filter(
        (session) => session.status === "finalized" && !excludedNames.includes(session.name)
      ),
    [sessions, excludedNames]
  );

  useEffect(() => {
    doneRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const toggle = (name: string) => {
    setDraft((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
    );
  };

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-[fade-in_120ms_ease] p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="precondition-modal-title"
        onClick={(event) => event.stopPropagation()}
        className={[
          "relative flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-[640px] flex-col",
          "rounded-2xl border border-vs-border bg-vs-sidebar shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]",
          "animate-pop"
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-vs-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="precondition-modal-title" className="text-ui-lg font-semibold tracking-tight m-0">
              Add pre-condition recordings
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-vs-text-dim">
              Choose finalized recordings to replay before your new session starts.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="rounded-md border-0 bg-transparent p-1.5 text-vs-text-dim cursor-pointer hover:bg-vs-hover hover:text-vs-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {available.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vs-border bg-vs-hover/40 px-4 py-8 text-center">
              <p className="m-0 text-ui-md font-medium text-vs-text">No recordings available</p>
              <p className="mt-1 text-[12px] text-vs-text-dim">
                Finalize a recording first, or remove duplicates from your queue.
              </p>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Available pre-condition recordings"
            >
              {available.map((session) => {
                const isSelected = draft.includes(session.name);
                const meta = session.targetUrl || session.summary || `${session.stepCount} steps`;

                return (
                  <button
                    key={session.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(session.name)}
                    className={[
                      "group relative flex w-full overflow-hidden rounded-xl border text-left transition-all duration-150 cursor-pointer",
                      isSelected
                        ? "border-vs-accent/50 bg-vs-accent/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-vs-accent)_35%,transparent)]"
                        : "border-vs-border bg-vs-hover/40 hover:border-vs-accent/25 hover:bg-vs-hover"
                    ].join(" ")}
                  >
                    <div className="relative h-[72px] w-[108px] shrink-0 overflow-hidden border-r border-vs-border bg-vs-bg">
                      <SessionThumb
                        {...(session.thumbnailUrl !== undefined
                          ? { thumbnailUrl: session.thumbnailUrl }
                          : {})}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <p className="m-0 min-w-0 flex-1 truncate text-ui-md font-semibold text-vs-text">
                          {session.name}
                        </p>
                        <span
                          className={[
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                            isSelected
                              ? "border-vs-accent bg-vs-accent text-white"
                              : "border-vs-border bg-vs-bg text-transparent group-hover:border-vs-accent/40"
                          ].join(" ")}
                          aria-hidden
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                      </div>
                      <p className="m-0 truncate text-[11px] text-vs-text-dim">{meta}</p>
                      <p className="m-0 flex items-center gap-1.5 text-[10px] text-vs-text-dim">
                        <Layers size={10} className="shrink-0 opacity-70" />
                        <span>{session.stepCount} steps</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-vs-border px-5 py-4">
          <span className="text-[11.5px] text-vs-text-dim">
            {draft.length > 0 ? `${draft.length} selected` : "Select one or more recordings"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              ref={doneRef}
              variant="primary"
              size="md"
              disabled={draft.length === 0}
              onClick={() => onDone(draft)}
            >
              Add {draft.length > 0 ? `(${draft.length})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

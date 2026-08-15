import { useMemo, useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/recording/ui/Button";
import { SessionThumb } from "@/components/recording/dashboard/SessionThumb";
import type { RecordingSession } from "@/lib/recording-ui-types";
import { PreconditionSelectModal } from "./PreconditionSelectModal";
import { appendUniqueNames, removeName, reorderItems } from "./precondition-utils";

interface PreconditionRecordingsFieldProps {
  readonly sessions: readonly RecordingSession[];
  readonly value: readonly string[];
  readonly disabled?: boolean;
  readonly onChange: (names: string[]) => void;
}

function sessionMeta(session: RecordingSession | undefined): string {
  if (session === undefined) {
    return "Recording unavailable";
  }
  return session.targetUrl || session.summary || `${session.stepCount} steps`;
}

export function PreconditionRecordingsField({
  sessions,
  value,
  disabled = false,
  onChange
}: PreconditionRecordingsFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const finalizedSessions = useMemo(
    () => sessions.filter((session) => session.status === "finalized"),
    [sessions]
  );
  const sessionByName = useMemo(
    () => new Map(finalizedSessions.map((session) => [session.name, session])),
    [finalizedSessions]
  );
  const canAdd = finalizedSessions.some((session) => !value.includes(session.name));

  const move = (fromIndex: number, toIndex: number) => {
    onChange(reorderItems(value, fromIndex, toIndex));
  };

  const removeAt = (index: number) => {
    const name = value[index];
    if (name === undefined) {
      return;
    }
    onChange(removeName(value, name));
  };

  const handleDragStart = (index: number) => {
    if (disabled) {
      return;
    }
    setDragIndex(index);
    setDropIndex(index);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (disabled || dragIndex === null || dragIndex === index) {
      return;
    }
    setDropIndex(index);
    onChange(reorderItems(value, dragIndex, index));
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-vs-text-dim">
            Pre-condition recordings
          </label>
          <p className="mt-1 text-[11.5px] text-vs-text-dim leading-snug">
            Optional. Replay finalized flows in order before recording starts.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !canAdd}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={12} /> Add
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vs-border bg-vs-hover/30 px-4 py-5 text-center">
          <p className="m-0 text-[12px] text-vs-text-dim">
            {finalizedSessions.length === 0
              ? "Finalize a recording to use it as a pre-condition."
              : "No pre-conditions added yet."}
          </p>
          {canAdd && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setModalOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-vs-border bg-vs-bg px-3 py-1.5 text-[11.5px] font-medium text-vs-text cursor-pointer hover:border-vs-accent/30 hover:text-vs-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={12} /> Add recording
            </button>
          )}
        </div>
      ) : (
        <ol
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label="Pre-condition playback order"
        >
          {value.map((name, index) => {
            const session = sessionByName.get(name);
            const isDragging = dragIndex === index;
            const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

            return (
              <li key={`${name}-${index}`} className="m-0">
                <div
                  onDragOver={(event) => handleDragOver(event, index)}
                  className={[
                    "flex items-center gap-2 rounded-xl border bg-vs-hover/40 px-2 py-2 transition-all duration-150",
                    isDragging ? "opacity-60 border-vs-accent/40" : "border-vs-border",
                    isDropTarget ? "ring-2 ring-vs-accent/30" : ""
                  ].join(" ")}
                >
                  <div
                    draggable={!disabled}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                      handleDragStart(index);
                    }}
                    onDragEnd={handleDragEnd}
                    aria-label={`Reorder ${name}`}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    className={[
                      "flex h-8 w-7 shrink-0 items-center justify-center rounded-md",
                      disabled
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-grab active:cursor-grabbing text-vs-text-dim hover:text-vs-text"
                    ].join(" ")}
                  >
                    <GripVertical size={14} />
                  </div>

                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vs-bg font-mono text-[10px] text-vs-text-dim">
                    {index + 1}
                  </span>

                  <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-vs-border bg-vs-bg">
                    <SessionThumb
                      {...(session?.thumbnailUrl !== undefined
                        ? { thumbnailUrl: session.thumbnailUrl }
                        : {})}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-ui-md font-medium text-vs-text">{name}</p>
                    <p className="m-0 truncate text-[10.5px] text-vs-text-dim">
                      {sessionMeta(session)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Move ${name} up`}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, index - 1)}
                      className="rounded-md border-0 bg-transparent p-1.5 text-vs-text-dim cursor-pointer hover:bg-vs-bg hover:text-vs-text disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${name} down`}
                      disabled={disabled || index === value.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="rounded-md border-0 bg-transparent p-1.5 text-vs-text-dim cursor-pointer hover:bg-vs-bg hover:text-vs-text disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      disabled={disabled}
                      onClick={() => removeAt(index)}
                      className="rounded-md border-0 bg-transparent p-1.5 text-vs-text-dim cursor-pointer hover:bg-tone-red/10 hover:text-tone-red disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {value.length > 0 && canAdd && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border-0 bg-transparent px-1 py-1 text-[11.5px] font-medium text-vs-accent cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={12} /> Add another
        </button>
      )}

      {modalOpen && (
        <PreconditionSelectModal
          sessions={finalizedSessions}
          excludedNames={value}
          onCancel={() => setModalOpen(false)}
          onDone={(names) => {
            onChange(appendUniqueNames(value, names));
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

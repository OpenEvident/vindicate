import { FileJson } from "lucide-react";
import { SessionThumb } from "./SessionThumb";
import { StatusBadge } from "@/components/recording/shared/StatusBadge";
import type { RecordingSession } from "@/lib/recording-ui-types";

interface SessionCardProps {
  readonly session: RecordingSession;
  readonly listMode: boolean;
  readonly onOpen: () => void;
  readonly onOpenArtifact: (artifactPath: string) => void;
}

export function SessionCard({ session, listMode, onOpen, onOpenArtifact }: SessionCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open recording: ${session.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={[
        "group flex cursor-pointer rounded-xl border border-vs-border bg-vs-bg overflow-hidden",
        "transition-all duration-150",
        "hover:border-vs-accent/30 hover:shadow-[0_14px_34px_-18px_color-mix(in_oklab,var(--color-vs-accent)_45%,transparent)]",
        "hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent",
        listMode ? "flex-row" : "flex-col"
      ].join(" ")}
    >
      <div
        className={[
          "relative overflow-hidden border-vs-border bg-vs-bg shrink-0",
          listMode ? "w-[168px] min-h-[92px] border-r" : "h-[128px] border-b"
        ].join(" ")}
      >
        <SessionThumb {...(session.thumbnailUrl !== undefined ? { thumbnailUrl: session.thumbnailUrl } : {})} />
        <div className="absolute top-2.5 left-2.5 z-10">
          <StatusBadge status={session.status} />
        </div>
      </div>

      <div className={["flex flex-1 flex-col gap-2 p-3.5 min-w-0", listMode ? "justify-center" : ""].join(" ")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="m-0 truncate text-ui-lg font-semibold text-vs-text">{session.name}</h3>
            <p className="mt-1 truncate text-ui-sm text-vs-text-dim">
              {session.targetUrl || session.summary || `${session.stepCount} steps`}
            </p>
          </div>
          {session.artifactPath !== undefined && (
            <button
              type="button"
              aria-label={`Open JSON artifact for ${session.name}`}
              title="Open JSON artifact"
              onClick={(e) => {
                e.stopPropagation();
                onOpenArtifact(session.artifactPath!);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className="shrink-0 rounded-md border-0 bg-transparent p-1 text-vs-text-dim cursor-pointer hover:text-vs-text hover:bg-vs-hover transition-colors"
            >
              <FileJson size={14} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-ui-sm text-vs-text-dim">
          <span>{session.whenLabel}</span>
          <span>·</span>
          <span>{session.stepCount} steps</span>
          <span>·</span>
          {session.started_by === "agent" ? (
            <span className="rounded-md border border-tone-violet/30 bg-tone-violet/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-tone-violet">
              Agent recorded
            </span>
          ) : (
            <span>Human recorded</span>
          )}
        </div>
      </div>
    </div>
  );
}

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/recording/ui/Button";
import { SessionThumb } from "./SessionThumb";
import { StatusBadge } from "@/components/recording/shared/StatusBadge";
import type { RecordingSession } from "@/lib/recording-ui-types";

interface ResumeBarProps {
  readonly session: RecordingSession;
  readonly onResume: () => void;
  readonly onPreview: () => void;
}

export function ResumeBar({ session, onResume, onPreview }: ResumeBarProps) {
  return (
    <div
      className={[
        "grid grid-cols-[auto_1fr_auto] gap-4 items-center",
        "rounded-xl border border-tone-amber/40 px-4 py-3.5 mb-5",
        "bg-gradient-to-r from-[color-mix(in_oklab,var(--color-tone-amber)_12%,var(--color-vs-bg))] to-vs-bg"
      ].join(" ")}
    >
      {/* Thumbnail */}
      <div className="relative w-[92px] h-[62px] rounded-lg overflow-hidden border border-vs-border shrink-0">
        <SessionThumb
          {...(session.thumbnailUrl !== undefined ? { thumbnailUrl: session.thumbnailUrl } : {})}
        />
      </div>

      {/* Body */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight">
          {session.name}
          <StatusBadge status="review" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-ui-base text-vs-text-dim">
          <span>{session.stepCount} steps</span>
          <span aria-hidden="true" className="w-1 h-1 rounded-full bg-vs-text-dim opacity-50" />
          <code className="font-mono text-ui-sm text-vs-text">{session.targetUrl}</code>
          <span aria-hidden="true" className="w-1 h-1 rounded-full bg-vs-text-dim opacity-50" />
          <span>{session.whenLabel}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={onPreview}>
          Preview
        </Button>
        <Button variant="primary" size="sm" onClick={onResume}>
          <ArrowRight size={13} />
          Resume review
        </Button>
      </div>
    </div>
  );
}

import { Globe } from "lucide-react";
import type { RecordingMode } from "@/lib/recording-ui-types";

interface BrowserBarProps {
  readonly url: string;
  readonly mode: RecordingMode;
}

export function BrowserBar({ url, mode }: BrowserBarProps) {
  const isLive = mode === "recording";

  return (
    <div
      className={[
        "flex items-center gap-2.5 px-3 py-2 border-b border-vs-border",
        "bg-[color-mix(in_oklab,var(--color-vs-sidebar)_70%,var(--color-vs-bg))]"
      ].join(" ")}
    >
      {/* Traffic lights */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28ca42]" />
      </div>

      {/* URL pill */}
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-vs-border bg-vs-bg px-3 py-1">
        <Globe size={11} className="shrink-0 text-tone-emerald" />
        <span className="min-w-0 truncate font-mono text-[10.5px] text-vs-text">{url}</span>
      </div>

      {/* Recording / stopped badge */}
      <span
        className={[
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1",
          "font-mono text-[9.5px] tracking-[0.06em]",
          isLive ? "bg-tone-red text-white" : "bg-vs-bg/90 text-vs-text"
        ].join(" ")}
      >
        <span
          className={[
            "w-1.5 h-1.5 rounded-full",
            isLive ? "bg-white animate-pulse-dot" : "bg-tone-emerald"
          ].join(" ")}
        />
        {isLive ? "Recording" : "Stopped"}
      </span>
    </div>
  );
}

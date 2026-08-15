import { STATUS_META } from "@/lib/recording-constants";
import type { SessionStatus } from "@/lib/recording-ui-types";

interface StatusBadgeProps {
  readonly status: SessionStatus;
  readonly pulse?: boolean;
}

export function StatusBadge({ status, pulse = false }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "font-mono text-[9px] uppercase tracking-[0.06em]",
        "px-2 py-1 rounded-full border",
        meta.textClass,
        meta.bgClass,
        meta.borderClass
      ].join(" ")}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full shrink-0",
          meta.dotClass,
          pulse ? "animate-pulse-dot" : ""
        ].join(" ")}
      />
      {meta.label}
    </span>
  );
}

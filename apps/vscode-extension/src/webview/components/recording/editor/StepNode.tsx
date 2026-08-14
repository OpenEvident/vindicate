import { Camera } from "lucide-react";
import { ACTION_META } from "@/lib/recording-constants";
import type { ActionType } from "@/lib/recording-ui-types";

interface StepNodeProps {
  readonly seq: number;
  readonly action: ActionType;
  readonly hasScreenshot: boolean;
  readonly selected: boolean;
  readonly isLast: boolean;
}

export function StepNode({ seq, action, hasScreenshot, selected, isLast }: StepNodeProps) {
  const meta = ACTION_META[action];

  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: 34 }}>
      {/* Circle */}
      <div
        className={[
          "relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
          "font-mono text-[12.5px] font-semibold bg-vs-bg z-10",
          "transition-all duration-150",
          meta.nodeColorClass,
          meta.nodeBorderClass,
          selected ? "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-vs-accent)_18%,transparent)]" : "",
        ].join(" ")}
      >
        {seq}
        {/* Screenshot badge */}
        {hasScreenshot && (
          <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-vs-border bg-vs-bg text-vs-text-dim">
            <Camera size={8} />
          </span>
        )}
      </div>

      {/* Spine connector — real DOM div, no pseudo-element */}
      {!isLast && (
        <div
          className="w-0.5 flex-1 min-h-[12px]"
          style={{
            background: "linear-gradient(to bottom, var(--color-vs-border), color-mix(in oklab, var(--color-vs-border) 50%, transparent))",
          }}
        />
      )}
    </div>
  );
}

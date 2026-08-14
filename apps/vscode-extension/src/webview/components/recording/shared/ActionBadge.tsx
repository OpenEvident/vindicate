import { ACTION_META } from "@/lib/recording-constants";
import type { ActionType } from "@/lib/recording-ui-types";
import {
  MousePointerClick, Keyboard, ChevronDown, Navigation,
  Space, Camera, CheckSquare, Square, ScrollText, MousePointer2, Upload,
  Move, MousePointer, ExternalLink, ArrowLeftRight, XSquare,
} from "lucide-react";

const ACTION_ICONS: Record<ActionType, React.ReactElement> = {
  click:       <MousePointerClick size={11} />,
  fill:        <Keyboard size={11} />,
  select:      <ChevronDown size={11} />,
  navigate:    <Navigation size={11} />,
  press_key:   <Space size={11} />,
  snapshot:    <Camera size={11} />,
  check:       <CheckSquare size={11} />,
  uncheck:     <Square size={11} />,
  scroll:      <ScrollText size={11} />,
  hover:       <MousePointer2 size={11} />,
  upload_file: <Upload size={11} />,
  drag:        <Move size={11} />,
  dblclick:    <MousePointer size={11} />,
  new_tab:            <ExternalLink size={11} />,
  switch_tab:         <ArrowLeftRight size={11} />,
  switch_tab_by_url:  <ArrowLeftRight size={11} />,
  close_tab:          <XSquare size={11} />,
};

interface ActionBadgeProps {
  readonly action: ActionType;
  readonly navigationTrigger?: "explicit" | "implicit";
}

export function ActionBadge({ action, navigationTrigger }: ActionBadgeProps) {
  const meta = ACTION_META[action];
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className={[
          "inline-flex items-center gap-1.5 shrink-0",
          "font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]",
          "px-2 py-0.5 rounded-md",
          meta.badgeClasses,
        ].join(" ")}
      >
        {ACTION_ICONS[action]}
        {meta.label}
      </span>
      {action === "navigate" && navigationTrigger === "implicit" && (
        <span
          className="inline-flex shrink-0 rounded-md border border-tone-amber/30 bg-tone-amber/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-tone-amber"
          title="Automatic navigation — caused by the previous action. Not a separate test step."
        >
          auto
        </span>
      )}
      {action === "navigate" && navigationTrigger === "explicit" && (
        <span
          className="inline-flex shrink-0 rounded-md border border-tone-blue/30 bg-tone-blue/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-tone-blue"
          title="Manual navigation — browser went to this URL directly."
        >
          manual
        </span>
      )}
    </span>
  );
}

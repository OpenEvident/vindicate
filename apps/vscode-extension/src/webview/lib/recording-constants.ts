import type { ActionType, LocatorStrength, SessionStatus } from "@/lib/recording-ui-types";

// ── Action metadata ───────────────────────────────────────────────────────────

export interface ActionMeta {
  readonly label: string;
  readonly tone: string;
  /** Tailwind bg + text color classes for the badge */
  readonly badgeClasses: string;
  /** Tailwind text color class for the node */
  readonly nodeColorClass: string;
  /** Tailwind border color class for the node */
  readonly nodeBorderClass: string;
}

export const ACTION_META: Record<ActionType, ActionMeta> = {
  click: {
    label: "Click",
    tone: "blue",
    badgeClasses: "bg-tone-blue/15 text-tone-blue",
    nodeColorClass: "text-tone-blue",
    nodeBorderClass: "border-tone-blue/60"
  },
  fill: {
    label: "Fill",
    tone: "violet",
    badgeClasses: "bg-tone-violet/15 text-tone-violet",
    nodeColorClass: "text-tone-violet",
    nodeBorderClass: "border-tone-violet/60"
  },
  select: {
    label: "Select",
    tone: "cyan",
    badgeClasses: "bg-tone-cyan/15 text-tone-cyan",
    nodeColorClass: "text-tone-cyan",
    nodeBorderClass: "border-tone-cyan/60"
  },
  navigate: {
    label: "Navigate",
    tone: "amber",
    badgeClasses: "bg-tone-amber/15 text-tone-amber",
    nodeColorClass: "text-tone-amber",
    nodeBorderClass: "border-tone-amber/60"
  },
  press_key: {
    label: "Press key",
    tone: "pink",
    badgeClasses: "bg-tone-pink/15 text-tone-pink",
    nodeColorClass: "text-tone-pink",
    nodeBorderClass: "border-tone-pink/60"
  },
  snapshot: {
    label: "Snapshot",
    tone: "emerald",
    badgeClasses: "bg-tone-emerald/15 text-tone-emerald",
    nodeColorClass: "text-tone-emerald",
    nodeBorderClass: "border-tone-emerald/60"
  },
  check: {
    label: "Check",
    tone: "green",
    badgeClasses: "bg-tone-emerald/15 text-tone-emerald",
    nodeColorClass: "text-tone-emerald",
    nodeBorderClass: "border-tone-emerald/60"
  },
  uncheck: {
    label: "Uncheck",
    tone: "slate",
    badgeClasses: "bg-vs-hover text-vs-text-dim",
    nodeColorClass: "text-vs-text-dim",
    nodeBorderClass: "border-vs-border"
  },
  scroll: {
    label: "Scroll",
    tone: "indigo",
    badgeClasses: "bg-tone-violet/15 text-tone-violet",
    nodeColorClass: "text-tone-violet",
    nodeBorderClass: "border-tone-violet/60"
  },
  hover: {
    label: "Hover",
    tone: "teal",
    badgeClasses: "bg-tone-cyan/15 text-tone-cyan",
    nodeColorClass: "text-tone-cyan",
    nodeBorderClass: "border-tone-cyan/60"
  },
  upload_file: {
    label: "Upload",
    tone: "orange",
    badgeClasses: "bg-tone-amber/15 text-tone-amber",
    nodeColorClass: "text-tone-amber",
    nodeBorderClass: "border-tone-amber/60"
  },
  drag: {
    label: "Drag",
    tone: "indigo",
    badgeClasses: "bg-tone-violet/15 text-tone-violet",
    nodeColorClass: "text-tone-violet",
    nodeBorderClass: "border-tone-violet/60"
  },
  dblclick: {
    label: "Dblclick",
    tone: "pink",
    badgeClasses: "bg-tone-pink/15 text-tone-pink",
    nodeColorClass: "text-tone-pink",
    nodeBorderClass: "border-tone-pink/60"
  },
  new_tab: {
    label: "New tab",
    tone: "amber",
    badgeClasses: "bg-tone-amber/15 text-tone-amber",
    nodeColorClass: "text-tone-amber",
    nodeBorderClass: "border-tone-amber/60"
  },
  switch_tab: {
    label: "Switch tab",
    tone: "amber",
    badgeClasses: "bg-tone-amber/15 text-tone-amber",
    nodeColorClass: "text-tone-amber",
    nodeBorderClass: "border-tone-amber/60"
  },
  switch_tab_by_url: {
    label: "Switch tab",
    tone: "amber",
    badgeClasses: "bg-tone-amber/15 text-tone-amber",
    nodeColorClass: "text-tone-amber",
    nodeBorderClass: "border-tone-amber/60"
  },
  close_tab: {
    label: "Close tab",
    tone: "slate",
    badgeClasses: "bg-vs-hover text-vs-text-dim",
    nodeColorClass: "text-vs-text-dim",
    nodeBorderClass: "border-vs-border"
  }
};

// ── Locator strength metadata ─────────────────────────────────────────────────

export interface StrengthMeta {
  readonly bars: 1 | 2 | 3;
  readonly label: string;
  readonly colorClass: string;
}

export const STRENGTH_META: Record<LocatorStrength, StrengthMeta> = {
  strong: { bars: 3, label: "Stable", colorClass: "bg-tone-emerald" },
  medium: { bars: 2, label: "Okay", colorClass: "bg-tone-amber" },
  weak: { bars: 1, label: "Fragile", colorClass: "bg-tone-red" }
};

// ── Session status metadata ───────────────────────────────────────────────────

export interface StatusMeta {
  readonly label: string;
  readonly dotClass: string;
  readonly textClass: string;
  readonly bgClass: string;
  readonly borderClass: string;
}

export const STATUS_META: Record<SessionStatus, StatusMeta> = {
  recording: {
    label: "Recording",
    dotClass: "bg-tone-red",
    textClass: "text-tone-red",
    bgClass: "bg-tone-red/15",
    borderClass: "border-tone-red/35"
  },
  review: {
    label: "In review",
    dotClass: "bg-tone-amber",
    textClass: "text-tone-amber",
    bgClass: "bg-tone-amber/15",
    borderClass: "border-tone-amber/35"
  },
  finalized: {
    label: "Finalized",
    dotClass: "bg-tone-emerald",
    textClass: "text-tone-emerald",
    bgClass: "bg-tone-emerald/15",
    borderClass: "border-tone-emerald/35"
  }
};

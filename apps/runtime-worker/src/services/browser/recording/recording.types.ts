import type { StructuredLocator } from "@vindicate/protocol";
import type { Page } from "playwright-core";

export interface SelectorCandidatePayload {
  strategy: string;
  value: string;
  attr?: string;
  strength?: "strong" | "medium" | "weak";
  dynamic?: boolean;
  container?: { role: string; name: string };
  /** Ancestor iframe host locators, outermost first — see SelectorCandidateSchema.frame_path. */
  frame_path?: StructuredLocator[];
  /** See SelectorCandidateSchema.click_delegate (protocol) — forwarded from the resolved locator for
   * agent-recorded steps only; human-recorded steps never set this. */
  click_delegate?: boolean;
}

export interface RecordingPageSnapshotElement {
  ref: string;
  role: string;
  name: string;
  tag: string;
  value?: string;
  disabled?: boolean;
  aria_invalid?: boolean | null;
  aria_required?: boolean | null;
  /** Set when candidates/chosen were derived from a click-delegate ancestor (see recording-page-snapshot.evaluate.ts). */
  click_delegate?: boolean;
  candidates: SelectorCandidatePayload[];
  chosen: SelectorCandidatePayload | null;
  element: {
    role?: string;
    name?: string;
    tag: string;
    id?: string;
    placeholder?: string;
  };
}

export interface RecordingPageSnapshot {
  url: string;
  title: string;
  alerts?: string[];
  truncated?: boolean;
  elements: RecordingPageSnapshotElement[];
}

export interface RecordingEventPayload {
  action: string;
  timestamp: string;
  candidates: SelectorCandidatePayload[];
  chosen: SelectorCandidatePayload | null;
  element?: {
    role?: string;
    name?: string;
    tag: string;
    id?: string;
    placeholder?: string;
  };
  text?: string;
  url?: string;
  /** Present when action is switch_tab — the tab index to switch to (mirrors SwitchTabStep). */
  index?: number;
  key?: string;
  target?: {
    candidates?: SelectorCandidatePayload[];
    chosen?: SelectorCandidatePayload | null;
    element?: RecordingEventPayload["element"];
  };
  files?: string[];
  actor?: "human" | "agent";
  navigation_trigger?: "explicit" | "implicit";
  env_var?: boolean;
  env_var_name?: string;
}

export type RecordingStep = RecordingEventPayload & {
  seq: number;
  screenshot_after?: string;
  page_snapshot?: RecordingPageSnapshot;
};

export interface RecordingSessionState {
  sessionId: string;
  name: string;
  safeName: string;
  projectRoot: string;
  status: "recording" | "review" | "finalized";
  steps: RecordingStep[];
  startedAt: string;
  testidAttr: string;
  finalSnapshot?: RecordingPageSnapshot;
  started_by?: "human" | "agent";
  paused?: boolean;
  currentUrl?: string;
  lastPageSnapshot?: { url: string; snapshot: RecordingPageSnapshot };
  pendingNavigationTrigger?: {
    seq: number;
    action: "click" | "dblclick" | "press_key";
    timestampMs: number;
    urlBefore?: string;
  };
  /**
   * The page the most recently recorded (or attributed) event came from — in-memory bookkeeping only,
   * never serialized to the artifact. Used to detect a tab switch (a site-opened popup gaining focus, or
   * focus returning to an already-open page) purely from event arrival, with no dependency on whether a
   * page-open/close listener happened to fire first. `undefined` until the first attributable event.
   */
  lastEventPage?: Page;
}

export interface AgentStepPayload {
  action: string;
  timestamp: string;
  actor: "agent";
  chosen: SelectorCandidatePayload | null;
  candidates: SelectorCandidatePayload[];
  element?: RecordingEventPayload["element"];
  text?: string;
  url?: string;
  /** Present when action is switch_tab — the tab index to switch to (mirrors SwitchTabStep). */
  index?: number;
  key?: string;
  target?: RecordingEventPayload["target"];
  files?: string[];
}

export interface FinalizeRecordingData {
  editedSteps?: RecordingStep[];
  pre_conditions?: string[];
  post_conditions?: string[];
  depends_on?: string[];
  summary?: string;
}

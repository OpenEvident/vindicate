export type LocatorStrategy =
  | "testid"
  | "testid_xpath"
  | "dom_id"
  | "role_name"
  | "label"
  | "placeholder"
  | "text"
  | "attr_combo"
  | "scoped"
  | "sibling_text"
  | "nth"
  // legacy recordings
  | "role+name"
  | "css"
  | "xpath";

export type LocatorStrength = "strong" | "medium" | "weak";

/**
 * One ancestor `<iframe>` host-locator hop — mirrors the protocol's `StructuredLocator` shape (see
 * packages/protocol/src/runtime/locator.ts), kept local since the webview doesn't depend on
 * `@vindicate/protocol`. Not rendered directly today; declared so `LocatorCandidate` reflects the full wire
 * shape a candidate can actually carry.
 */
export interface FramePathHop {
  readonly strategy: string;
  readonly confidence: "high" | "low";
  readonly attr?: string;
  readonly value?: string;
  readonly role?: string;
  readonly name?: string;
  readonly xpath?: string;
  readonly container?: { readonly role: string; readonly name: string };
}

export interface LocatorCandidate {
  readonly strategy: LocatorStrategy;
  readonly value: string;
  readonly attr?: string;
  readonly strength?: LocatorStrength;
  readonly recommended?: boolean;
  readonly dynamic?: boolean;
  readonly container?: { readonly role: string; readonly name: string };
  /** Ancestor iframe host locators, outermost first — present when the element was captured inside a
   * nested iframe. See SelectorCandidateSchema.frame_path in packages/protocol/src/runtime/recording.ts. */
  readonly frame_path?: readonly FramePathHop[];
}

export type ActionType =
  | "click"
  | "fill"
  | "select"
  | "navigate"
  | "press_key"
  | "snapshot"
  | "check"
  | "uncheck"
  | "scroll"
  | "hover"
  | "upload_file"
  | "drag"
  | "dblclick"
  // Tab/popup awareness — new_tab/switch_tab/switch_tab_by_url mirror the agent's own explicit tab
  // actions; switch_tab_by_url is also synthesized for a site-opened popup during human recording.
  | "new_tab"
  | "switch_tab"
  | "switch_tab_by_url"
  | "close_tab";

export interface DragTarget {
  readonly candidates?: readonly LocatorCandidate[];
  readonly chosen: LocatorCandidate | null;
  readonly element?: CapturedElement;
}

export interface CapturedElement {
  readonly tag: string;
  readonly role?: string;
  readonly name?: string;
  readonly id?: string;
  readonly placeholder?: string;
}

export interface PageSnapshotElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly tag: string;
  readonly value?: string;
  readonly ariaInvalid?: boolean;
  readonly candidates: readonly LocatorCandidate[];
  readonly chosen: LocatorCandidate | null;
}

export interface PageSnapshot {
  readonly url: string;
  readonly title: string;
  readonly alerts?: readonly string[];
  readonly truncated?: boolean;
  readonly elements: readonly PageSnapshotElement[];
}

export interface RecordingStep {
  readonly seq: number;
  readonly action: ActionType;
  readonly timestamp: string;
  readonly text?: string;
  readonly url?: string;
  /** Present when action is switch_tab — the tab index switched to. */
  readonly index?: number;
  readonly key?: string;
  readonly files?: readonly string[];
  readonly target?: DragTarget;
  readonly element?: CapturedElement;
  readonly candidates: readonly LocatorCandidate[];
  chosen: LocatorCandidate | null;
  readonly pageSnapshot?: PageSnapshot;
  readonly screenshotUrl?: string;
  readonly actor?: "human" | "agent";
  readonly navigationTrigger?: "explicit" | "implicit";
  readonly envVar?: boolean;
  readonly envVarName?: string;
}

export type SessionStatus = "recording" | "review" | "finalized";
export type RecordingMode = "recording" | "review" | "finalized";
export type RecordingView = "dashboard" | "new" | "editor";

export interface RecordingSession {
  readonly id: string;
  readonly name: string;
  readonly safeName: string;
  readonly status: SessionStatus;
  readonly stepCount: number;
  readonly startedAt: string;
  readonly whenLabel: string;
  readonly targetUrl: string;
  readonly thumbnailUrl?: string;
  readonly artifactPath?: string;
  readonly started_by: "human" | "agent";
  readonly summary?: string;
}

export type BrowserEngine = "chromium" | "firefox" | "webkit";

export interface NewRecordingForm {
  name: string;
  url: string;
  browser: BrowserEngine;
  preconditionRecordings: string[];
}

export type PreviewTarget = { type: "none" } | { type: "step"; seq: number } | { type: "final" };

export type PlaybackState =
  | { status: "idle" }
  | { status: "running"; total: number; current?: number; recordingName?: string }
  | { status: "failed"; error: string; failedStep: number; recordingName: string; command?: string }
  | { status: "done" };

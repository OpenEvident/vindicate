import type {
  ConfigStatuses,
  DashboardMetrics,
  Mode,
  McpToolName,
  VindicateWorkspaceState,
  PromptTemplate,
  SelectedTools,
  ServiceHealth,
  StepId
} from "./types";

export type ExtensionMessage =
  | {
      type: "workspace:resolved";
      hasFolder: boolean;
      folderName: string | null;
      folderPath: string | null;
    }
  | { type: "onboarding:stateSync"; state: VindicateWorkspaceState }
  | { type: "onboarding:stepDone"; step: StepId }
  | { type: "onboarding:stepRevoked"; step: StepId }
  | { type: "dashboard:loading" }
  | { type: "dashboard:metrics"; metrics: DashboardMetrics }
  | { type: "dashboard:error"; message: string }
  | { type: "prompts:templates"; templates: PromptTemplate[] }
  | {
      type: "health:status";
      runtime: ServiceHealth["runtime"];
      mcp: ServiceHealth["mcp"];
    }
  | { type: "config:status"; statuses: ConfigStatuses }
  | {
      type: "config:operationResult";
      tool: McpToolName;
      operation: "add" | "resync" | "disconnect";
      ok: boolean;
      message?: string;
    }
  | { type: "onboarding:toolsDetected"; tools: SelectedTools }
  | { type: "navigate:screen"; screen: Screen }
  | { type: "workspace:recentFolders"; folders: string[] }
  | {
      type: "recording_started";
      sessionId: string;
      name: string;
      safeName: string;
      started_by: "human" | "agent";
      preconditionRecordings?: string[];
      projectRoot?: string;
    }
  | { type: "recording_steps_batch"; steps: unknown[] }
  | { type: "recording_show_dashboard" }
  | { type: "recording_stopped"; finalScreenshotUrl?: string; finalSnapshot?: unknown }
  | { type: "recording_finalized"; path: string }
  | { type: "recording_finalize_failed"; error: string }
  | { type: "recording_discarded" }
  | { type: "recording_discard_failed"; error: string }
  | {
      type: "recording_restored";
      status: "recording" | "review" | "finalized";
      steps: unknown[];
      name: string;
      sessionId?: string;
      safeName?: string;
      artifactPath?: string;
      started_by?: "human" | "agent";
      finalScreenshotUrl?: string;
      preconditionRecordings?: string[];
    }
  | { type: "recording_load_failed"; error: string }
  | { type: "recordings_list"; entries: unknown[]; error?: string }
  | { type: "playback_started"; total: number }
  | { type: "playback_progress"; current: number; total: number; recordingName: string }
  | {
      type: "playback_failed";
      error: string;
      failedStep: number;
      recordingName: string;
      command?: string;
    }
  | { type: "playback_complete" }
  | { type: "worker_status"; online: boolean }
  | { type: "annotate_succeeded"; safeName: string }
  | { type: "annotate_failed"; safeName: string; error: string };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "onboarding:selectMode"; mode: Mode }
  | { type: "onboarding:confirmTools"; tools: SelectedTools }
  | { type: "onboarding:markStepDone"; step: StepId }
  | { type: "onboarding:resetMode" }
  | { type: "config:addMcp"; tool: McpToolName }
  | { type: "config:resyncMcp"; tool: McpToolName }
  | { type: "config:disconnectMcp"; tool: McpToolName }
  | { type: "prompts:saveTemplates"; templates: PromptTemplate[] }
  | { type: "metrics:refresh" }
  | { type: "tests:runAll"; suites?: string[] }
  | { type: "nav:openFullView" }
  | { type: "nav:showPanel" }
  | { type: "nav:openRecordings" }
  | { type: "nav:openFolder" }
  | { type: "nav:openFile"; file: string; line?: number }
  | { type: "nav:openDocs" }
  | { type: "nav:openWebsite" }
  | { type: "nav:reportProblem" }
  | { type: "nav:openRecentFolder"; path: string }
  | { type: "onboarding:markOnboardingDone" }
  | { type: "logs:open" }
  | {
      type: "finalize";
      steps: unknown[];
      name: string;
      sessionId?: string;
      safeName?: string;
      pre_conditions?: string[];
      post_conditions?: string[];
      depends_on?: string[];
      summary?: string;
    }
  | { type: "refresh" }
  | { type: "list_recordings" }
  | {
      type: "start_recording";
      name: string;
      targetUrl: string;
      preconditionRecordings: string[];
    }
  | { type: "stop_recording"; sessionId: string }
  | { type: "take_snapshot"; sessionId: string }
  | {
      type: "webview_client_error";
      surface: "sidebar" | "editor" | "panel" | "recording";
      source: "window-error" | "unhandledrejection" | "react-boundary";
      message: string;
      stack?: string;
    }
  | { type: "discard"; sessionId: string }
  | { type: "delete_recording"; safeName: string; projectRoot?: string }
  | { type: "open_recording"; artifactPath: string }
  | {
      type: "load_recording_session";
      sessionId: string;
      safeName: string;
      name: string;
      status: "recording" | "review" | "finalized";
      artifactPath?: string;
      started_by: "human" | "agent";
    }
  | { type: "copy_path"; path: string }
  | {
      type: "annotate";
      safeName: string;
      projectRoot?: string;
      pre_conditions: string[];
      post_conditions: string[];
      depends_on?: string[];
      summary: string;
    };

export type Screen =
  "toolSelection" | "modeSelection" | "scaffold" | "gettingStarted" | "dashboard" | "noFolder";

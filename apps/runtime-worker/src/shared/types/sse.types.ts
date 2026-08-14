/**
 * @file SSE event payloads for command streams and worker push channel (ARCHITECTURE §6.2).
 */

/** Command stream: accepted */
export interface CommandAcceptedEvent {
  event: "accepted";
  command_id: string;
}

export interface StepStartedEvent {
  event: "step_started";
  step: number;
  action: string;
  url?: string;
}

export interface StepProgressEvent {
  event: "step_progress";
  step: number;
  message: string;
}

export interface StepCompletedEvent {
  event: "step_completed";
  step: number;
  duration_ms: number;
}

export interface CommandCompletedEvent {
  event: "completed";
  command_id: string;
  result: unknown;
}

export interface CommandFailedEvent {
  event: "failed";
  step: number;
  action: string;
  error: string;
  code: string;
}

export interface CommandTimeoutEvent {
  event: "timeout";
  step: number;
  action: string;
  limit_ms: number;
  message: string;
}

export interface CommandThrottledEvent {
  event: "throttled";
  reason: string;
  retry_after_ms?: number;
}

export interface ActionResultEvent {
  event: "action_result";
  page_change: "navigation" | "round_trip" | "significant" | "minor" | "none";
  recommendation: "snapshot" | "diff" | "none";
  url_before?: string;
  url_after?: string;
  url_trail?: readonly string[];
  hint?: string;
  settle_timed_out?: boolean;
}

export type CommandStreamEvent =
  | CommandAcceptedEvent
  | StepStartedEvent
  | StepProgressEvent
  | StepCompletedEvent
  | CommandCompletedEvent
  | CommandFailedEvent
  | CommandTimeoutEvent
  | CommandThrottledEvent
  | ActionResultEvent;

/** Push channel (GET /events) */
export interface SessionDeadPushEvent {
  event: "session_dead";
  session_id: string;
  reason: string;
}

export interface SessionExpiredPushEvent {
  event: "session_expired";
  session_id: string;
}

export interface WorkerHealthPushEvent {
  event: "worker_health";
  governor_state: string;
}

export interface WorkerThrottledPushEvent {
  event: "worker_throttled";
  reason: string;
  retry_after_ms?: number;
}

export interface ResyncRequiredPushEvent {
  event: "resync_required";
  message: string;
  from_seq: number;
  buffer_size?: number;
}

export interface SessionPausedPushEvent {
  event: "session_paused";
  session_id: string;
  message: string;
}

export interface SessionResumedFromPausePushEvent {
  event: "session_resumed_from_pause";
  session_id: string;
}

export interface SessionPausedExpiredPushEvent {
  event: "session_paused_expired";
  session_id: string;
  reason: string;
}

export type PushChannelEvent =
  | SessionDeadPushEvent
  | SessionExpiredPushEvent
  | WorkerHealthPushEvent
  | WorkerThrottledPushEvent
  | ResyncRequiredPushEvent
  | SessionPausedPushEvent
  | SessionResumedFromPausePushEvent
  | SessionPausedExpiredPushEvent;

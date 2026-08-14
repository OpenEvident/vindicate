/**
 * @file HTTP client contract for runtime-worker — role interfaces + combined type.
 */
import type { RecordingArtifact, RecordingsIndexEntry } from "@vindicate/protocol";

export type WorkerStep = Record<string, unknown>;

export interface SessionRecord {
  readonly session_id: string;
  readonly name: string;
  readonly status: string;
  readonly url?: string;
  readonly description?: string;
  readonly resumable?: boolean;
  readonly created_at?: string;
  readonly last_active_at?: string;
  /** Present when resume_from_pause is called with include_snapshot. */
  readonly snapshot?: unknown;
}

export interface CreateSessionParams {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly headless?: boolean;
  readonly testid_attr?: string;
  readonly project_root: string;
}

export interface StepResult {
  readonly step: number;
  readonly result: unknown;
}

export interface StepsResult {
  readonly steps: StepResult[];
}

export interface WorkerHealthResponse {
  readonly ok: boolean;
  readonly status?: string;
  readonly service?: string;
  readonly version?: string;
  readonly protocolVersion?: string;
  readonly disk_free_mb?: number;
}

export interface WorkerCapabilitiesResponse {
  readonly protocolVersion: string;
  readonly browser: { readonly actions: string[]; readonly coming_soon?: string[] };
  readonly files: { readonly operations: string[] };
}

export interface CommandStreamOptions {
  readonly onStreamOpen?: () => void;
  readonly onEvent?: (event: Record<string, unknown>) => void;
  /** Override the circuit-breaker fetch timeout for this call only (ms). */
  readonly timeoutMs?: number;
}

export interface ConsoleLogOpts {
  readonly since_snapshot_id?: number;
  readonly level?: string;
  readonly limit?: number;
}

export interface NetworkLogOpts {
  readonly since_snapshot_id?: number;
  readonly status_min?: number;
  readonly url_contains?: string;
  readonly limit?: number;
}

export interface ResumeFromPauseOptions {
  readonly include_snapshot?: boolean;
}

export interface ISessionManager {
  createSession(params: CreateSessionParams): Promise<SessionRecord>;
  listSessions(): Promise<SessionRecord[]>;
  closeSession(sessionId: string): Promise<void>;
  /** Recreate browser context after worker restart when session status is dead. */
  resumeSession(sessionId: string): Promise<SessionRecord>;
  /** Resume a session paused via pause_for_human / browser_pause_for_human. */
  resumeFromPause(sessionId: string, opts?: ResumeFromPauseOptions): Promise<SessionRecord>;
}

export interface ICommandRunner {
  runStep(sessionId: string, step: WorkerStep, options?: CommandStreamOptions): Promise<StepResult>;
  runSteps(
    sessionId: string,
    steps: WorkerStep[],
    options?: CommandStreamOptions
  ): Promise<StepsResult>;
}

export interface ILogReader {
  getConsoleLogs(sessionId: string, opts?: ConsoleLogOpts): Promise<{ entries: unknown[] }>;
  getNetworkLogs(sessionId: string, opts?: NetworkLogOpts): Promise<{ entries: unknown[] }>;
  getActionLog(sessionId: string, opts?: { limit?: number }): Promise<{ entries: unknown[] }>;
}

export const API_REQUEST_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type ApiRequestMethod = (typeof API_REQUEST_METHODS)[number];

export const API_REQUEST_BODY_TYPES = ["json", "form"] as const;
export type ApiRequestBodyType = (typeof API_REQUEST_BODY_TYPES)[number];

export interface ApiRequestParams {
  readonly method: ApiRequestMethod;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly body_type?: ApiRequestBodyType;
  readonly params?: Record<string, string>;
  readonly timeout_ms?: number;
}

export interface ApiRequestResponse {
  readonly status: number;
  readonly status_text: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly body_json?: unknown;
}

/** Fallback/gap-filler only (mirrors browser_diagnose's role for UI) — never a proactive
 * double-check when the caller already has complete information. */
export interface IApiRequestClient {
  apiRequest(params: ApiRequestParams): Promise<ApiRequestResponse>;
}

export interface IStorageClient {
  getCookies(sessionId: string, url?: string): Promise<{ cookies: unknown[] }>;
  setCookies(sessionId: string, cookies: unknown[]): Promise<void>;
  clearCookies(sessionId: string): Promise<void>;
  getStorage(sessionId: string, type: "local" | "session"): Promise<Record<string, string>>;
  setStorage(sessionId: string, type: "local" | "session", key: string, value: string): Promise<void>;
  clearStorage(sessionId: string, type: "local" | "session"): Promise<void>;
}

export interface IWorkerLifecycle {
  health(): Promise<WorkerHealthResponse>;
  getHealth(): Promise<Record<string, unknown>>;
  getCapabilities(): Promise<WorkerCapabilitiesResponse>;
  setWorkerShuttingDown(value: boolean): void;
  isWorkerReady(): boolean;
  markWorkerReady(): void;
}

export type IWorkerClient = ISessionManager &
  ICommandRunner &
  ILogReader &
  IStorageClient &
  IWorkerLifecycle &
  IApiRequestClient & {
    startRecording(
      sessionId: string,
      name: string,
      options?: { started_by?: "human" | "agent" }
    ): Promise<void>;
    finalizeRecording(
      sessionId: string,
      data: {
        pre_conditions: string[];
        post_conditions: string[];
        depends_on: string[];
        summary: string;
      }
    ): Promise<{ name: string; safe_name: string; path: string }>;
    discardRecording(sessionId: string): Promise<void>;
    listRecordings(projectRoot: string): Promise<{ entries: RecordingsIndexEntry[] }>;
    readRecording(projectRoot: string, safeName: string): Promise<RecordingArtifact | undefined>;
    annotateRecording(
      projectRoot: string,
      safeName: string,
      data: {
        pre_conditions: string[];
        post_conditions: string[];
        depends_on: string[];
        summary: string;
      }
    ): Promise<void>;
    subscribeToWorkerEvents(
      onEvent: (event: Record<string, unknown>) => void,
      signal: AbortSignal
    ): Promise<void>;
  };

/**
 * @file HTTP client to runtime-worker with circuit breaker.
 */
import { RecordingsIndexEntrySchema } from "@vindicate/protocol";
import type { RecordingArtifact, RecordingsIndexEntry } from "@vindicate/protocol";
import { z } from "zod";
import path from "node:path";
import { parseSseStream } from "../shared/sse.js";
import { logger } from "../core/logger.js";
import {
  ActionTimeoutError,
  SessionDeadError,
  WorkerShuttingDownError,
  WorkerUnavailableError
} from "../shared/errors.js";

import type {
  ApiRequestParams,
  ApiRequestResponse,
  CommandStreamOptions,
  IWorkerClient,
  SessionRecord,
  StepResult,
  StepsResult,
  WorkerCapabilitiesResponse,
  WorkerHealthResponse,
  WorkerStep
} from "./worker-client.interface.js";
import { throwFromWorkerResponse } from "./worker-errors.js";
import { readWorkerRecordingError } from "./recording-error.js";

/** Worker GET /browser/recordings response — entries only, not the on-disk index file shape. */
const RecordingsListResponseSchema = z.object({
  entries: z.array(RecordingsIndexEntrySchema)
});

function summarizeSteps(steps: readonly WorkerStep[]): string {
  return steps
    .map((s) => {
      const action = s["action"];
      return typeof action === "string" ? action : "unknown";
    })
    .join(", ");
}

export type CircuitState = "healthy" | "degraded" | "down";

export interface WorkerClientConfig {
  readonly baseUrl: string;
  readonly internalKey: string;
  readonly retryTimeoutMs: number;
  readonly healthProbeMs: number;
  readonly slowResponseMs?: number;
  /** Fast responses required before leaving degraded state. */
  readonly degradedRecoveryStreak?: number;
  readonly fetchFn?: typeof fetch;
}

export class WorkerClient implements IWorkerClient {
  private state: CircuitState = "healthy";
  private shuttingDown = false;
  private workerReady = false;
  private slowStreak = 0;
  private fastStreak = 0;
  private readonly slowResponseMs: number;
  private readonly degradedRecoveryStreak: number;
  private readonly fetchFn: typeof fetch;
  private readonly deadSessions = new Set<string>();
  private throttledUntil = 0;

  constructor(private readonly cfg: WorkerClientConfig) {
    this.slowResponseMs = cfg.slowResponseMs ?? 5_000;
    this.degradedRecoveryStreak = cfg.degradedRecoveryStreak ?? 3;
    this.fetchFn = cfg.fetchFn ?? fetch;
  }

  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  get internalKey(): string {
    return this.cfg.internalKey;
  }

  get circuitState(): CircuitState {
    return this.state;
  }

  setWorkerShuttingDown(value: boolean): void {
    this.shuttingDown = value;
  }

  isWorkerReady(): boolean {
    return this.workerReady;
  }

  markWorkerReady(): void {
    this.workerReady = true;
  }

  markSessionDead(sessionId: string): void {
    this.deadSessions.add(sessionId);
  }

  clearSessionDead(sessionId: string): void {
    this.deadSessions.delete(sessionId);
  }

  markWorkerThrottled(retryAfterMs: number): void {
    this.throttledUntil = Math.max(this.throttledUntil, Date.now() + Math.max(0, retryAfterMs));
  }

  async health(): Promise<WorkerHealthResponse> {
    const body = await this.getHealth();
    if (body.ok !== true) {
      return { ok: false };
    }
    return {
      ok: true,
      status: typeof body.status === "string" ? body.status : "ok",
      ...(typeof body.service === "string" ? { service: body.service } : {}),
      ...(typeof body.version === "string" ? { version: body.version } : {}),
      ...(typeof body.protocolVersion === "string"
        ? { protocolVersion: body.protocolVersion }
        : {}),
      ...(typeof body.disk_free_mb === "number" ? { disk_free_mb: body.disk_free_mb } : {})
    };
  }

  async getHealth(): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.cfg.baseUrl}/health`, {
      headers: this.headers()
    });
    if (!res.ok) {
      return { ok: false };
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async getCapabilities(): Promise<WorkerCapabilitiesResponse> {
    return this.requestJson("/capabilities", { method: "GET" });
  }

  async apiRequest(params: ApiRequestParams): Promise<ApiRequestResponse> {
    return this.requestJson("/api-request", { method: "POST", body: JSON.stringify(params) });
  }

  async createSession(params: {
    name: string;
    url: string;
    description?: string;
    headless?: boolean;
    testid_attr?: string;
    project_root: string;
  }): Promise<SessionRecord> {
    const data = await this.requestJson<{ session_id: string; name: string; status: string }>(
      "/browser/sessions",
      { method: "POST", body: JSON.stringify(params) }
    );
    this.clearSessionDead(data.session_id);
    return {
      session_id: data.session_id,
      name: data.name,
      status: data.status
    };
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.requestJson<SessionRecord[]>("/browser/sessions", { method: "GET" });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.requestJson(`/browser/sessions/${sessionId}`, { method: "DELETE" });
    this.clearSessionDead(sessionId);
  }

  async resumeSession(sessionId: string): Promise<SessionRecord> {
    const data = await this.requestJson<{ session_id: string; status: string; name?: string }>(
      `/browser/sessions/${sessionId}/resume`,
      { method: "POST", body: JSON.stringify({}) }
    );
    this.clearSessionDead(sessionId);
    return {
      session_id: data.session_id,
      name: data.name ?? "",
      status: data.status
    };
  }

  async resumeFromPause(
    sessionId: string,
    opts?: { include_snapshot?: boolean }
  ): Promise<SessionRecord> {
    const q = opts?.include_snapshot === true ? "?include_snapshot=true" : "";
    const data = await this.requestJson<{
      session_id: string;
      status: string;
      snapshot?: unknown;
    }>(`/browser/sessions/${sessionId}/resume_from_pause${q}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    this.clearSessionDead(sessionId);
    return {
      session_id: data.session_id,
      name: "",
      status: data.status,
      ...(data.snapshot !== undefined ? { snapshot: data.snapshot } : {})
    };
  }

  async getConsoleLogs(
    sessionId: string,
    opts?: { since_snapshot_id?: number; level?: string; limit?: number }
  ): Promise<{ entries: unknown[] }> {
    const q = new URLSearchParams();
    if (opts?.since_snapshot_id !== undefined) {
      q.set("since_snapshot_id", String(opts.since_snapshot_id));
    }
    if (opts?.level !== undefined) {
      q.set("level", opts.level);
    }
    if (opts?.limit !== undefined) {
      q.set("limit", String(opts.limit));
    }
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    return this.requestJson(`/browser/sessions/${sessionId}/console_logs${suffix}`, {
      method: "GET"
    });
  }

  async getNetworkLogs(
    sessionId: string,
    opts?: {
      since_snapshot_id?: number;
      status_min?: number;
      url_contains?: string;
      limit?: number;
    }
  ): Promise<{ entries: unknown[] }> {
    const q = new URLSearchParams();
    if (opts?.since_snapshot_id !== undefined) {
      q.set("since_snapshot_id", String(opts.since_snapshot_id));
    }
    if (opts?.status_min !== undefined) {
      q.set("status_min", String(opts.status_min));
    }
    if (opts?.url_contains !== undefined) {
      q.set("url_contains", opts.url_contains);
    }
    if (opts?.limit !== undefined) {
      q.set("limit", String(opts.limit));
    }
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    return this.requestJson(`/browser/sessions/${sessionId}/network_logs${suffix}`, {
      method: "GET"
    });
  }

  async getActionLog(
    sessionId: string,
    opts?: { limit?: number }
  ): Promise<{ entries: unknown[] }> {
    const q = new URLSearchParams();
    if (opts?.limit !== undefined) {
      q.set("limit", String(opts.limit));
    }
    const suffix = q.size > 0 ? `?${q.toString()}` : "";
    return this.requestJson(`/browser/sessions/${sessionId}/actions${suffix}`, {
      method: "GET"
    });
  }

  async getCookies(sessionId: string, url?: string): Promise<{ cookies: unknown[] }> {
    const step: WorkerStep = { action: "get_cookies", ...(url !== undefined ? { url } : {}) };
    const result = await this.runStep(sessionId, step);
    return (result.result as { cookies: unknown[] }) ?? { cookies: [] };
  }

  async setCookies(sessionId: string, cookies: unknown[]): Promise<void> {
    await this.runStep(sessionId, { action: "set_cookies", cookies });
  }

  async clearCookies(sessionId: string): Promise<void> {
    await this.runStep(sessionId, { action: "clear_cookies" });
  }

  async getStorage(sessionId: string, type: "local" | "session"): Promise<Record<string, string>> {
    const result = await this.runStep(sessionId, { action: "get_storage", type });
    return (result.result as Record<string, string>) ?? {};
  }

  async setStorage(
    sessionId: string,
    type: "local" | "session",
    key: string,
    value: string
  ): Promise<void> {
    await this.runStep(sessionId, { action: "set_storage", type, key, value });
  }

  async clearStorage(sessionId: string, type: "local" | "session"): Promise<void> {
    await this.runStep(sessionId, { action: "clear_storage", type });
  }

  async runStep(
    sessionId: string,
    step: WorkerStep,
    options?: CommandStreamOptions
  ): Promise<StepResult> {
    const { steps } = await this.runSteps(sessionId, [step], options);
    const first = steps[0];
    if (first === undefined) {
      throw new Error("Worker returned no step results");
    }
    return first;
  }

  async runSteps(
    sessionId: string,
    steps: WorkerStep[],
    options?: CommandStreamOptions
  ): Promise<StepsResult> {
    if (this.deadSessions.has(sessionId)) {
      throw new SessionDeadError(sessionId);
    }
    if (Date.now() < this.throttledUntil) {
      throw new WorkerUnavailableError(
        "Worker is throttled due to resource pressure. Retry shortly."
      );
    }
    return this.withCircuitBreaker(async () => {
      options?.onStreamOpen?.();
      const baseTimeout =
        this.state === "degraded" ? this.cfg.retryTimeoutMs * 2 : this.cfg.retryTimeoutMs;
      const timeoutMs = options?.timeoutMs ?? baseTimeout;
      const stepSummary = summarizeSteps(steps);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        logger.warn(
          { sessionId, timeoutMs, steps: stepSummary, circuitState: this.state },
          "[worker] client command timeout — aborting fetch"
        );
        controller.abort();
      }, timeoutMs);

      try {
        const res = await this.fetchFn(
          `${this.cfg.baseUrl}/browser/sessions/${sessionId}/commands`,
          {
            method: "POST",
            headers: {
              ...this.headers(),
              "Content-Type": "application/json",
              Accept: "text/event-stream"
            },
            body: JSON.stringify({ steps }),
            signal: controller.signal
          }
        );

        if (!res.ok) {
          await throwFromWorkerResponse(res, sessionId);
        }

        const stepResults: StepResult[] = [];
        let completed: unknown;

        for await (const event of parseSseStream(res.body)) {
          options?.onEvent?.(event);
          if (event.event === "completed") {
            const result = event.result as { steps?: unknown[] } | undefined;
            if (result?.steps !== undefined) {
              for (const [i, r] of result.steps.entries()) {
                stepResults.push({ step: i, result: r });
              }
            }
            completed = result;
          }
          if (event.event === "failed") {
            await throwFromWorkerResponse(
              new Response(JSON.stringify({ code: event.code, error: event.error }), {
                status: 422
              }),
              sessionId
            );
          }
        }

        if (stepResults.length === 0 && completed !== undefined) {
          const result = completed as { steps?: unknown[] };
          if (result.steps !== undefined) {
            for (const [i, r] of result.steps.entries()) {
              stepResults.push({ step: i, result: r });
            }
          }
        }

        return { steps: stepResults };
      } catch (err: unknown) {
        if (isClientAbortError(err)) {
          throw new ActionTimeoutError(
            `Worker command timed out after ${timeoutMs}ms (session ${sessionId}, steps: ${stepSummary}). ` +
              "The action may still be running on the browser — do not retry it, it could apply twice. " +
              "Call browser_read to check the current state: if the action took effect, continue; " +
              "if you can't tell, call browser_diagnose for a visual. " +
              "If browser_read reports the session is busy, wait and tell the user. " +
              "Otherwise report to the user and stop."
          );
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async startRecording(
    sessionId: string,
    name: string,
    options?: { started_by?: "human" | "agent" }
  ): Promise<void> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/sessions/${sessionId}/recording/start`,
      {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(options?.started_by !== undefined ? { started_by: options.started_by } : {})
        })
      }
    );
    if (!res.ok) {
      throw await readWorkerRecordingError(res);
    }
  }

  async finalizeRecording(
    sessionId: string,
    data: {
      pre_conditions: string[];
      post_conditions: string[];
      depends_on: string[];
      summary: string;
    }
  ): Promise<{ name: string; safe_name: string; path: string }> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/sessions/${sessionId}/recording/finalize`,
      {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }
    );
    if (!res.ok) {
      throw await readWorkerRecordingError(res);
    }
    const body = (await res.json()) as { path?: string; name?: string; safe_name?: string };
    return {
      name: body.name ?? "",
      safe_name: body.safe_name ?? path.basename(body.path ?? "", ".json"),
      path: body.path ?? ""
    };
  }

  async discardRecording(sessionId: string): Promise<void> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/sessions/${sessionId}/recording/discard`,
      {
        method: "POST",
        headers: this.headers()
      }
    );
    if (!res.ok) {
      throw await readWorkerRecordingError(res);
    }
  }

  async listRecordings(projectRoot: string): Promise<{ entries: RecordingsIndexEntry[] }> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/recordings?project_root=${encodeURIComponent(projectRoot)}`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      return { entries: [] };
    }
    const parsed = RecordingsListResponseSchema.safeParse(await res.json());
    return parsed.success ? { entries: parsed.data.entries } : { entries: [] };
  }

  async readRecording(
    projectRoot: string,
    safeName: string
  ): Promise<RecordingArtifact | undefined> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/recordings/${encodeURIComponent(safeName)}?project_root=${encodeURIComponent(projectRoot)}`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      return undefined;
    }
    return (await res.json()) as RecordingArtifact;
  }

  async annotateRecording(
    projectRoot: string,
    safeName: string,
    data: {
      pre_conditions: string[];
      post_conditions: string[];
      depends_on: string[];
      summary: string;
    }
  ): Promise<void> {
    const res = await this.fetchFn(
      `${this.cfg.baseUrl}/browser/recordings/${encodeURIComponent(safeName)}?project_root=${encodeURIComponent(projectRoot)}`,
      {
        method: "PATCH",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`annotateRecording failed ${res.status}: ${text}`);
    }
  }

  async subscribeToWorkerEvents(
    onEvent: (event: Record<string, unknown>) => void,
    signal: AbortSignal
  ): Promise<void> {
    const res = await this.fetchFn(`${this.cfg.baseUrl}/events`, {
      headers: this.headers(),
      signal
    });
    if (!res.ok || res.body === null) {
      return;
    }
    for await (const event of parseSseStream(res.body)) {
      if (signal.aborted) {
        return;
      }
      onEvent(event);
    }
  }

  private headers(): Record<string, string> {
    return { "x-vindicate-internal-key": this.cfg.internalKey };
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    return this.withCircuitBreaker(async () => {
      const res = await this.fetchFn(`${this.cfg.baseUrl}${path}`, {
        ...init,
        headers: {
          ...this.headers(),
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(init.headers as Record<string, string> | undefined)
        }
      });
      if (!res.ok) {
        await throwFromWorkerResponse(res);
      }
      return (await res.json()) as T;
    });
  }

  private async withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    if (this.shuttingDown) {
      throw new WorkerShuttingDownError();
    }

    if (this.state === "down") {
      await this.waitForRecovery();
    }

    const t0 = Date.now();
    try {
      const result = await fn();
      const elapsed = Date.now() - t0;
      if (elapsed > this.slowResponseMs) {
        this.slowStreak += 1;
        this.fastStreak = 0;
        if (this.slowStreak >= 2) {
          this.state = "degraded";
        }
      } else {
        this.slowStreak = 0;
        if (this.state === "degraded") {
          this.fastStreak += 1;
          if (this.fastStreak >= this.degradedRecoveryStreak) {
            this.state = "healthy";
            this.fastStreak = 0;
          }
        } else {
          this.fastStreak = 0;
        }
      }
      return result;
    } catch (err: unknown) {
      if (this.isConnectionError(err)) {
        this.state = "down";
        await this.waitForRecovery();
        return fn();
      }
      throw err;
    }
  }

  private isConnectionError(err: unknown): boolean {
    if (err instanceof ActionTimeoutError) {
      return false;
    }
    if (isClientAbortError(err)) {
      return false;
    }
    if (err instanceof TypeError) {
      return true;
    }
    return err instanceof WorkerUnavailableError;
  }

  private async waitForRecovery(): Promise<void> {
    const deadline = Date.now() + this.cfg.retryTimeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      if (this.shuttingDown) {
        throw new WorkerShuttingDownError();
      }
      try {
        const h = await this.health();
        if (h.ok) {
          this.state = "healthy";
          this.fastStreak = 0;
          this.workerReady = true;
          return;
        }
      } catch {
        /* probe failed */
      }
      const backoffMs = Math.min(this.cfg.healthProbeMs * 2 ** attempt, this.cfg.healthProbeMs * 8);
      attempt += 1;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
    throw new WorkerUnavailableError();
  }
}

function isClientAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  return err instanceof Error && err.name === "AbortError";
}

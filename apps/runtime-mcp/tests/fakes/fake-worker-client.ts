/**
 * @file Controllable fake worker client for tests.
 */
import { WorkerShuttingDownError, WorkerUnavailableError } from "../../src/shared/errors.js";
import type {
  ApiRequestParams,
  ApiRequestResponse,
  CommandStreamOptions,
  IWorkerClient,
  WorkerCapabilitiesResponse,
  SessionRecord,
  StepResult,
  StepsResult,
  WorkerHealthResponse,
  WorkerStep
} from "../../src/worker/worker-client.interface.js";
import type { RecordingArtifact, RecordingsIndexEntry } from "@vindicate/protocol";

export class FakeWorkerClient implements IWorkerClient {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private nextRunStepError: Error | undefined;
  private nextApiRequestError: Error | undefined;
  private nextApiRequestResponse: ApiRequestResponse | undefined;
  private workerDown = false;
  private shuttingDown = false;
  private ready = false;

  failNextRunStep(err: Error): void {
    this.nextRunStepError = err;
  }

  failNextApiRequest(err: Error): void {
    this.nextApiRequestError = err;
  }

  setNextApiRequestResponse(response: ApiRequestResponse): void {
    this.nextApiRequestResponse = response;
  }

  simulateWorkerDown(): void {
    this.workerDown = true;
  }

  simulateWorkerShutdown(): void {
    this.shuttingDown = true;
  }

  setWorkerShuttingDown(value: boolean): void {
    this.shuttingDown = value;
  }

  isWorkerReady(): boolean {
    return this.ready;
  }

  markWorkerReady(): void {
    this.ready = true;
  }

  async health(): Promise<WorkerHealthResponse> {
    this.calls.push({ method: "health", args: [] });
    if (this.workerDown) {
      throw new WorkerUnavailableError();
    }
    return { ok: true, status: "ok", service: "runtime-worker" };
  }

  async getHealth(): Promise<Record<string, unknown>> {
    this.calls.push({ method: "getHealth", args: [] });
    return { ok: true, service: "runtime-worker", status: "ok" };
  }

  async getCapabilities(): Promise<WorkerCapabilitiesResponse> {
    this.calls.push({ method: "getCapabilities", args: [] });
    return {
      protocolVersion: "1",
      browser: { actions: ["snapshot", "list_tabs"] },
      files: { operations: ["read", "replace"] }
    };
  }

  async apiRequest(params: ApiRequestParams): Promise<ApiRequestResponse> {
    this.calls.push({ method: "apiRequest", args: [params] });
    this.guard();
    if (this.nextApiRequestError !== undefined) {
      const err = this.nextApiRequestError;
      this.nextApiRequestError = undefined;
      throw err;
    }
    return this.nextApiRequestResponse ?? { status: 200, status_text: "OK", headers: {}, body: "" };
  }

  async createSession(params: {
    name: string;
    url: string;
    project_root: string;
  }): Promise<SessionRecord> {
    this.calls.push({ method: "createSession", args: [params] });
    this.guard();
    return {
      session_id: "00000000-0000-4000-8000-000000000001",
      name: params.name,
      status: "active"
    };
  }

  async listSessions(): Promise<SessionRecord[]> {
    this.calls.push({ method: "listSessions", args: [] });
    this.guard();
    return [];
  }

  async closeSession(sessionId: string): Promise<void> {
    this.calls.push({ method: "closeSession", args: [sessionId] });
    this.guard();
  }

  async resumeSession(sessionId: string): Promise<SessionRecord> {
    this.calls.push({ method: "resumeSession", args: [sessionId] });
    this.guard();
    return { session_id: sessionId, name: "resumed", status: "active" };
  }

  async resumeFromPause(
    sessionId: string,
    opts?: { include_snapshot?: boolean }
  ): Promise<SessionRecord> {
    this.calls.push({ method: "resumeFromPause", args: [sessionId, opts] });
    this.guard();
    return { session_id: sessionId, name: "resumed", status: "active" };
  }

  async getConsoleLogs(sessionId: string): Promise<{ entries: unknown[] }> {
    this.calls.push({ method: "getConsoleLogs", args: [sessionId] });
    return { entries: [] };
  }

  async getNetworkLogs(sessionId: string): Promise<{ entries: unknown[] }> {
    this.calls.push({ method: "getNetworkLogs", args: [sessionId] });
    return { entries: [] };
  }

  async getActionLog(sessionId: string): Promise<{ entries: unknown[] }> {
    this.calls.push({ method: "getActionLog", args: [sessionId] });
    return { entries: [] };
  }

  async getCookies(sessionId: string): Promise<{ cookies: unknown[] }> {
    this.calls.push({ method: "getCookies", args: [sessionId] });
    return { cookies: [] };
  }

  async setCookies(sessionId: string, cookies: unknown[]): Promise<void> {
    this.calls.push({ method: "setCookies", args: [sessionId, cookies] });
  }

  async clearCookies(sessionId: string): Promise<void> {
    this.calls.push({ method: "clearCookies", args: [sessionId] });
  }

  async getStorage(): Promise<Record<string, string>> {
    return {};
  }

  async setStorage(): Promise<void> {
    /* noop */
  }

  async clearStorage(): Promise<void> {
    /* noop */
  }

  async runStep(
    sessionId: string,
    step: WorkerStep,
    options?: CommandStreamOptions
  ): Promise<StepResult> {
    const { steps } = await this.runSteps(sessionId, [step], options);
    const first = steps[0];
    if (first === undefined) {
      throw new Error("no step result");
    }
    return first;
  }

  async runSteps(
    sessionId: string,
    steps: WorkerStep[],
    options?: CommandStreamOptions
  ): Promise<StepsResult> {
    this.calls.push({ method: "runSteps", args: [sessionId, steps] });
    this.guard();
    if (this.nextRunStepError !== undefined) {
      const err = this.nextRunStepError;
      this.nextRunStepError = undefined;
      throw err;
    }
    options?.onStreamOpen?.();
    const results: StepResult[] = [];
    for (const [i, step] of steps.entries()) {
      options?.onEvent?.({ event: "step_started", step: i, action: step.action });
      options?.onEvent?.({ event: "step_completed", step: i, duration_ms: 1 });
      results.push({ step: i, result: { ok: true, action: step.action } });
    }
    return { steps: results };
  }

  async startRecording(
    sessionId: string,
    name: string,
    _options?: { started_by?: "human" | "agent" }
  ): Promise<void> {
    this.calls.push({ method: "startRecording", args: [sessionId, name] });
    this.guard();
  }

  async finalizeRecording(
    sessionId: string,
    _data: {
      pre_conditions: string[];
      post_conditions: string[];
      depends_on: string[];
      summary: string;
    }
  ): Promise<{ name: string; safe_name: string; path: string }> {
    this.calls.push({ method: "finalizeRecording", args: [sessionId] });
    this.guard();
    return { name: "Test Flow", safe_name: "Test-Flow", path: "/tmp/Test-Flow.json" };
  }

  async discardRecording(sessionId: string): Promise<void> {
    this.calls.push({ method: "discardRecording", args: [sessionId] });
    this.guard();
  }

  async listRecordings(projectRoot: string): Promise<{ entries: RecordingsIndexEntry[] }> {
    this.calls.push({ method: "listRecordings", args: [projectRoot] });
    this.guard();
    return { entries: [] };
  }

  async readRecording(
    projectRoot: string,
    safeName: string
  ): Promise<RecordingArtifact | undefined> {
    this.calls.push({ method: "readRecording", args: [projectRoot, safeName] });
    this.guard();
    return undefined;
  }

  async annotateRecording(
    projectRoot: string,
    _safeName: string,
    _data: {
      pre_conditions: string[];
      post_conditions: string[];
      depends_on: string[];
      summary: string;
    }
  ): Promise<void> {
    this.calls.push({ method: "annotateRecording", args: [projectRoot] });
    this.guard();
  }

  async subscribeToWorkerEvents(
    onEvent: (event: Record<string, unknown>) => void,
    signal: AbortSignal
  ): Promise<void> {
    this.calls.push({ method: "subscribeToWorkerEvents", args: [] });
    this.guard();
    if (signal.aborted) {
      return;
    }
    onEvent({
      event: "recording_finalized",
      session_id: "00000000-0000-4000-8000-000000000001",
      name: "Test Flow",
      safe_name: "Test-Flow",
      path: "/tmp/Test-Flow.json"
    });
  }

  private guard(): void {
    if (this.shuttingDown) {
      throw new WorkerShuttingDownError();
    }
    if (this.workerDown) {
      throw new WorkerUnavailableError();
    }
  }
}

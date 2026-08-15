import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs/promises";

import type { WorkerManager } from "../processes/WorkerManager";
import { RUNTIME_PORT } from "../shared/constants";
import {
  findRecordingNameConflict,
  formatRecordingNameConflictMessage,
  recordingSlugKey
} from "../../shared/recording-name";
import { RecordingPanel } from "../views/RecordingPanel";
import { RecordingsDashboardPanel } from "../views/RecordingsDashboardPanel";
import { RecordingSessionStore, type SavedRecordingSession } from "./recording-session-store";
import { formatRelativeTime } from "../shared/formatRelativeTime";
import { resolveVindicatePath, toVindicateRelativePath } from "../../shared/recording-path";

interface RecordedStepPayload {
  seq: number;
  action: string;
  timestamp: string;
  screenshot_after?: string;
  screenshotUrl?: string;
  [key: string]: unknown;
}

interface RecordingsIndexEntry {
  safe_name: string;
  name: string;
  step_count: number;
  recorded_at: string;
  pages_covered?: string[];
  path: string;
  thumbnail_path?: string;
  started_by?: "human" | "agent";
  summary?: string;
}

interface RecordingSessionView {
  id: string;
  name: string;
  safeName: string;
  status: "recording" | "review" | "finalized";
  stepCount: number;
  startedAt: string;
  whenLabel: string;
  targetUrl: string;
  thumbnailUrl?: string;
  artifactPath?: string;
  started_by: "human" | "agent";
  summary?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((v): v is string => typeof v === "string");
}

function asRecordingSteps(value: unknown): RecordedStepPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is RecordedStepPayload => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as RecordedStepPayload).seq === "number"
    );
  });
}

export class RecordingController {
  private readonly sessionStore: RecordingSessionStore;
  private readonly stepBuffer = new Map<
    string,
    Array<{ step: RecordedStepPayload; screenshotAbsPath?: string }>
  >();
  private readonly flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly webviewErrorNotifiedAt = new Map<string, number>();
  private static readonly WEBVIEW_ERROR_DEDUPE_MS = 15000;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workerManager: WorkerManager,
    private readonly extensionUri: vscode.Uri
  ) {
    this.sessionStore = new RecordingSessionStore(context);
  }

  activate(): vscode.Disposable {
    void this.recoverActiveRecordings();

    const unsub = this.workerManager.onWorkerEvent((event) => {
      void this.handleWorkerEvent(event);
    });

    const cmds = [
      vscode.commands.registerCommand("vindicate.openRecordings", () => {
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const panel = RecordingsDashboardPanel.openOrReveal(this.extensionUri, projectRoot);
        panel.setMessageHandler((msg) => {
          void this.handleWebviewMessage(panel, msg);
        });
        panel.postMessage({ type: "recording_show_dashboard" });
        void this.sendRecordingsList(panel);
      })
    ];

    return vscode.Disposable.from(
      { dispose: unsub },
      {
        dispose: () => {
          for (const timer of this.flushTimers.values()) {
            clearTimeout(timer);
          }
          this.flushTimers.clear();
          this.stepBuffer.clear();
        }
      },
      ...cmds
    );
  }

  private internalHeaders(): Record<string, string> {
    const internalKey = this.workerManager.getInternalKey();
    return internalKey !== undefined ? { "x-vindicate-internal-key": internalKey } : {};
  }

  private resolveStepUris(
    step: RecordedStepPayload,
    screenshotAbsPath: string | undefined,
    webview: vscode.Webview
  ): RecordedStepPayload {
    if (screenshotAbsPath === undefined) {
      return step;
    }
    const webviewUri = webview.asWebviewUri(vscode.Uri.file(screenshotAbsPath)).toString();
    return { ...step, screenshotUrl: webviewUri };
  }

  private toWebviewFileUri(webview: vscode.Webview, absPath: string): string {
    return webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
  }

  private async resolveFinalScreenshotUri(
    recordingDir: string,
    webview: vscode.Webview
  ): Promise<string | undefined> {
    const finalPath = path.join(recordingDir, "final.png");
    try {
      await fs.access(finalPath);
      return this.toWebviewFileUri(webview, finalPath);
    } catch {
      return undefined;
    }
  }

  private async publishRecordingStoppedToWebview(
    sessionId: string,
    options?: { screenshotPath?: string; finalSnapshot?: unknown; resyncSteps?: boolean }
  ): Promise<void> {
    clearTimeout(this.flushTimers.get(sessionId));
    this.flushTimers.delete(sessionId);
    this.flushSteps(sessionId);

    const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
    const webview = this.getRecordingWebview(sessionId);
    if (webview === undefined) {
      return;
    }

    const state = await this.fetchRecordingState(sessionId);
    if (state.status === "finalized") {
      return;
    }

    const safeName = session?.safeName;
    const projectRoot = session?.projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const shouldResyncSteps = options?.resyncSteps === true || state.status === "none";

    if (
      shouldResyncSteps &&
      projectRoot !== undefined &&
      safeName !== undefined &&
      safeName.length > 0
    ) {
      const recordingDir = path.join(projectRoot, ".vindicate", "recordings", safeName);
      const resolvedSteps = state.steps.map((step) => {
        const absPath =
          step.screenshot_after !== undefined
            ? path.join(recordingDir, step.screenshot_after)
            : undefined;
        return this.resolveStepUris(step, absPath, webview);
      });

      if (resolvedSteps.length > 0) {
        this.postToRecordingWebviews(sessionId, {
          type: "recording_steps_batch",
          steps: resolvedSteps
        });
      }
    }

    let finalScreenshotUrl: string | undefined;
    let thumbnailPath: string | undefined;
    if (options?.screenshotPath !== undefined) {
      thumbnailPath = options.screenshotPath;
      finalScreenshotUrl = this.toWebviewFileUri(webview, options.screenshotPath);
    } else if (projectRoot !== undefined && safeName !== undefined && safeName.length > 0) {
      const recordingDir = path.join(projectRoot, ".vindicate", "recordings", safeName);
      finalScreenshotUrl = await this.resolveFinalScreenshotUri(recordingDir, webview);
      if (finalScreenshotUrl !== undefined) {
        thumbnailPath = path.join(recordingDir, "final.png");
      }
    }

    if (session !== undefined) {
      this.sessionStore.updateStatus(sessionId, "review", {
        ...(thumbnailPath !== undefined ? { thumbnailPath } : {})
      });
    }

    this.postToRecordingWebviews(sessionId, {
      type: "recording_stopped",
      ...(finalScreenshotUrl !== undefined ? { finalScreenshotUrl } : {}),
      ...(options?.finalSnapshot !== undefined ? { finalSnapshot: options.finalSnapshot } : {})
    });
    this.refreshRecordingsListIfVisible();
  }

  private async stopRecordingSession(sessionId: string): Promise<void> {
    try {
      const res = await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/stop`,
        {
          method: "POST",
          headers: this.internalHeaders()
        }
      );
      if (res.ok) {
        return;
      }
      // Safe fallback only when session/browser is gone.
      if (res.status === 404 || res.status === 410) {
        await this.publishRecordingStoppedToWebview(sessionId, { resyncSteps: true });
        return;
      }
      this.postRecordingLoadFailed(
        sessionId,
        `Stop recording failed (${res.status}). Session remains active; please retry.`
      );
    } catch {
      // Transport failure: worker may be down/browser closed. Best-effort transition.
      await this.publishRecordingStoppedToWebview(sessionId, { resyncSteps: true });
    }
  }

  private async takeRecordingSnapshot(sessionId: string): Promise<void> {
    try {
      await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/snapshot`,
        {
          method: "POST",
          headers: this.internalHeaders()
        }
      );
    } catch {
      /* browser closed or worker offline */
    }
  }

  private getRecordingWebview(sessionId: string): vscode.Webview | undefined {
    return RecordingPanel.get(sessionId)?.webview ?? RecordingsDashboardPanel.getCurrent()?.webview;
  }

  private postToRecordingWebviews(sessionId: string, message: Record<string, unknown>): void {
    RecordingsDashboardPanel.getCurrent()?.postMessage(message);
    RecordingPanel.get(sessionId)?.postMessage(message);
  }

  private postDiscardFailed(sessionId: string, error: string): void {
    const message = { type: "recording_discard_failed" as const, error };
    RecordingsDashboardPanel.getCurrent()?.postMessage(message);
    RecordingPanel.get(sessionId)?.postMessage(message);
  }

  private postRecordingLoadFailed(sessionId: string, error: string): void {
    const message = { type: "recording_load_failed" as const, error };
    RecordingsDashboardPanel.getCurrent()?.postMessage(message);
    RecordingPanel.get(sessionId)?.postMessage(message);
  }

  private shouldNotifyWebviewError(signature: string): boolean {
    const now = Date.now();
    const lastAt = this.webviewErrorNotifiedAt.get(signature);
    this.webviewErrorNotifiedAt.set(signature, now);
    if (lastAt === undefined) {
      return true;
    }
    return now - lastAt > RecordingController.WEBVIEW_ERROR_DEDUPE_MS;
  }

  private async refreshRecordingsList(): Promise<void> {
    const dashboard = RecordingsDashboardPanel.getCurrent();
    if (dashboard !== undefined) {
      await this.sendRecordingsList(dashboard);
    }
  }

  private resolveEntryUris(
    entry: RecordingsIndexEntry,
    webview: vscode.Webview,
    projectRoot: string
  ): RecordingSessionView {
    const thumbnailUrl =
      entry.thumbnail_path !== undefined
        ? webview.asWebviewUri(vscode.Uri.file(entry.thumbnail_path)).toString()
        : undefined;
    const now = Date.now();
    return {
      id: entry.safe_name,
      name: entry.name,
      safeName: entry.safe_name,
      status: "finalized",
      stepCount: entry.step_count,
      startedAt: entry.recorded_at,
      whenLabel: formatRelativeTime(entry.recorded_at, now),
      targetUrl: entry.pages_covered?.[0] ?? "",
      ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
      artifactPath: toVindicateRelativePath(entry.path, projectRoot),
      started_by: entry.started_by ?? "human",
      ...(entry.summary !== undefined ? { summary: entry.summary } : {})
    };
  }

  private buildActiveSessionViews(
    panel: RecordingsDashboardPanel | RecordingPanel
  ): RecordingSessionView[] {
    return this.sessionStore
      .getAll()
      .filter(
        (s): s is typeof s & { status: "recording" | "review" } =>
          s.status === "recording" || s.status === "review"
      )
      .map((s) => {
        const thumbnailUrl =
          s.thumbnailPath !== undefined
            ? panel.webview.asWebviewUri(vscode.Uri.file(s.thumbnailPath)).toString()
            : undefined;
        return {
          id: s.id,
          name: s.name,
          safeName: s.safeName,
          status: s.status,
          stepCount: s.stepCount,
          startedAt: s.startedAt,
          whenLabel: formatRelativeTime(s.startedAt, Date.now()),
          targetUrl: "",
          ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
          started_by: s.started_by ?? "human"
        } satisfies RecordingSessionView;
      });
  }

  private refreshRecordingsListIfVisible(): void {
    const dashboard = RecordingsDashboardPanel.getCurrent();
    if (dashboard !== undefined) {
      void this.sendRecordingsList(dashboard);
    }
  }

  private bufferStep(
    sessionId: string,
    step: RecordedStepPayload,
    screenshotAbsPath?: string
  ): void {
    if (!this.stepBuffer.has(sessionId)) {
      this.stepBuffer.set(sessionId, []);
    }
    this.stepBuffer
      .get(sessionId)!
      .push(screenshotAbsPath !== undefined ? { step, screenshotAbsPath } : { step });

    clearTimeout(this.flushTimers.get(sessionId));
    this.flushTimers.set(
      sessionId,
      setTimeout(() => {
        this.flushSteps(sessionId);
      }, 50)
    );
  }

  private flushSteps(sessionId: string): void {
    const items = this.stepBuffer.get(sessionId) ?? [];
    this.stepBuffer.delete(sessionId);
    if (items.length === 0) {
      return;
    }
    const webview = this.getRecordingWebview(sessionId);
    if (webview === undefined) {
      return;
    }
    this.postToRecordingWebviews(sessionId, {
      type: "recording_steps_batch",
      steps: items.map(({ step, screenshotAbsPath }) =>
        this.resolveStepUris(step, screenshotAbsPath, webview)
      )
    });
  }

  private async discardRecordingSession(sessionId: string, closeSession = true): Promise<void> {
    try {
      await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/discard`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...this.internalHeaders() },
          body: JSON.stringify({ ...(closeSession ? { close_session: true } : {}) })
        }
      );
    } catch {
      /* best effort */
    }
  }

  private normalizeStepsForWorker(steps: RecordedStepPayload[]): RecordedStepPayload[] {
    return steps.map((step) => {
      const out: RecordedStepPayload = { ...step };
      if (step["envVar"] === true) {
        out.env_var = true;
      }
      if (typeof step["envVarName"] === "string") {
        out.env_var_name = step["envVarName"];
      }
      if (step["navigationTrigger"] === "explicit" || step["navigationTrigger"] === "implicit") {
        out.navigation_trigger = step["navigationTrigger"];
      }
      return out;
    });
  }

  private buildFinalizeBody(
    msg: Record<string, unknown>,
    steps: RecordedStepPayload[],
    sessionId?: string
  ): Record<string, unknown> {
    const body: Record<string, unknown> = { steps: this.normalizeStepsForWorker(steps) };
    const preConditions = asStringArray(msg["pre_conditions"]);
    if (preConditions !== undefined) {
      body.pre_conditions = preConditions;
    }
    const postConditions = asStringArray(msg["post_conditions"]);
    if (postConditions !== undefined) {
      body.post_conditions = postConditions;
    }
    const dependsOn = asStringArray(msg["depends_on"]) ?? [];
    const session =
      sessionId !== undefined
        ? this.sessionStore.getAll().find((s) => s.id === sessionId)
        : undefined;
    const preconditions = session?.preconditionRecordings ?? [];
    body.depends_on = [...new Set([...preconditions, ...dependsOn])];
    const summary = asString(msg["summary"]);
    if (summary !== undefined) {
      body.summary = summary;
    }
    return body;
  }

  private async getTestidAttr(): Promise<string | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot === undefined) {
      return undefined;
    }
    const configPath = path.join(workspaceRoot, ".vindicate", "config.json");
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const config = JSON.parse(raw) as { testidAttr?: string; testid_attr?: string };
      return config.testidAttr ?? config.testid_attr;
    } catch {
      return undefined;
    }
  }

  private async fetchRecordingState(sessionId: string): Promise<{
    status: "none" | "recording" | "review" | "finalized";
    steps: RecordedStepPayload[];
    name: string;
  }> {
    try {
      const res = await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/state`,
        {
          headers: this.internalHeaders()
        }
      );
      if (!res.ok) {
        return { status: "none", steps: [], name: "" };
      }
      const body = (await res.json()) as {
        status: "none" | "recording" | "review" | "finalized";
        steps: RecordedStepPayload[];
        name: string;
      };
      return body;
    } catch {
      return { status: "none", steps: [], name: "" };
    }
  }

  private async recoverActiveRecordings(): Promise<void> {
    for (const session of this.sessionStore
      .getAll()
      .filter((s) => s.status === "recording" || s.status === "review")) {
      try {
        const state = await this.fetchRecordingState(session.id);
        if (state.status === "none") {
          this.sessionStore.remove(session.id);
          continue;
        }
        let thumbnailPath = session.thumbnailPath;
        const recordingDir = path.join(
          session.projectRoot,
          ".vindicate",
          "recordings",
          session.safeName
        );
        if (thumbnailPath === undefined) {
          const finalPath = path.join(recordingDir, "final.png");
          try {
            await fs.access(finalPath);
            thumbnailPath = finalPath;
          } catch {
            for (const step of state.steps) {
              if (step.screenshot_after !== undefined) {
                thumbnailPath = path.join(recordingDir, step.screenshot_after);
                break;
              }
            }
          }
          if (thumbnailPath !== undefined) {
            this.sessionStore.updateStatus(session.id, session.status, { thumbnailPath });
          }
        }
        const panel = RecordingPanel.getOrCreate(
          session.id,
          this.context,
          this.extensionUri,
          session.projectRoot,
          session.name
        );
        panel.setMessageHandler((msg) => {
          void this.handleWebviewMessage(panel, msg);
        });
        const webview = panel.webview;
        const finalScreenshotUrl =
          thumbnailPath !== undefined
            ? this.toWebviewFileUri(webview, thumbnailPath)
            : await this.resolveFinalScreenshotUri(recordingDir, webview);
        this.postToRecordingWebviews(session.id, {
          type: "recording_restored",
          status: state.status === "finalized" ? "review" : state.status,
          steps: state.steps.map((s) => {
            const absPath =
              s.screenshot_after !== undefined
                ? path.join(recordingDir, s.screenshot_after)
                : undefined;
            return this.resolveStepUris(s, absPath, webview);
          }),
          name: state.name,
          ...(session.preconditionRecordings !== undefined
            ? { preconditionRecordings: session.preconditionRecordings }
            : {}),
          ...(finalScreenshotUrl !== undefined ? { finalScreenshotUrl } : {})
        });
      } catch (err) {
        console.error("[RecordingController] failed to recover session", session.id, err);
      }
    }
  }

  private async listKnownRecordingSessions(
    projectRoot: string
  ): Promise<Array<{ safeName: string; name: string; status: string }>> {
    const fromStore = this.sessionStore
      .getAll()
      .filter((s) => s.status !== "abandoned")
      .map((s) => ({ safeName: s.safeName, name: s.name, status: s.status }));

    if (projectRoot === "") {
      return fromStore;
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings?project_root=${encodeURIComponent(projectRoot)}`,
        { headers: this.internalHeaders() }
      );
      if (!res.ok) {
        return fromStore;
      }
      const { entries } = (await res.json()) as { entries: RecordingsIndexEntry[] };
      const seen = new Set(fromStore.map((s) => recordingSlugKey(s.safeName)));
      const fromIndex = entries
        .filter((e) => !seen.has(recordingSlugKey(e.safe_name)))
        .map((e) => ({ safeName: e.safe_name, name: e.name, status: "finalized" }));
      return [...fromStore, ...fromIndex];
    } catch {
      return fromStore;
    }
  }

  private async sendRecordingsList(
    panel: RecordingsDashboardPanel | RecordingPanel
  ): Promise<void> {
    const active = this.buildActiveSessionViews(panel);
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (projectRoot === undefined) {
      panel.postMessage({ type: "recordings_list", entries: active });
      return;
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings?project_root=${encodeURIComponent(projectRoot)}`,
        { headers: this.internalHeaders() }
      );
      if (!res.ok) {
        panel.postMessage({
          type: "recordings_list",
          entries: active,
          error: `Failed to load recordings: ${res.status}`
        });
        return;
      }
      const { entries } = (await res.json()) as { entries: RecordingsIndexEntry[] };
      const finalized = entries.map((entry) =>
        this.resolveEntryUris(entry, panel.webview, projectRoot)
      );
      panel.postMessage({ type: "recordings_list", entries: [...active, ...finalized] });
    } catch (err) {
      panel.postMessage({
        type: "recordings_list",
        entries: active,
        error: err instanceof Error ? err.message : "Worker is offline"
      });
    }
  }

  private async loadRecordingSession(
    panel: RecordingsDashboardPanel | RecordingPanel,
    msg: Record<string, unknown>
  ): Promise<void> {
    const sessionId = asString(msg["sessionId"]);
    const safeName = asString(msg["safeName"]);
    const name = asString(msg["name"]);
    const statusRaw = asString(msg["status"]);
    const artifactPath = asString(msg["artifactPath"]);
    const startedBy = asString(msg["started_by"]) === "agent" ? "agent" : "human";
    const postFailed = (error: string) => {
      panel.postMessage({ type: "recording_load_failed", error });
    };

    if (name === undefined || safeName === undefined || statusRaw === undefined) {
      postFailed("Invalid recording session.");
      return;
    }

    const status = statusRaw as "recording" | "review" | "finalized";
    const webview = panel.webview;
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (status === "finalized") {
      if (projectRoot === undefined) {
        postFailed("No workspace folder open.");
        return;
      }
      try {
        const res = await fetch(
          `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings/${encodeURIComponent(safeName)}?project_root=${encodeURIComponent(projectRoot)}`,
          { headers: this.internalHeaders() }
        );
        if (!res.ok) {
          postFailed(`Failed to load recording: ${res.status}`);
          return;
        }
        const artifact = (await res.json()) as {
          steps: RecordedStepPayload[];
          session_id?: string;
          started_by?: "human" | "agent";
          depends_on?: string[];
        };
        const recordingDir = path.join(projectRoot, ".vindicate", "recordings", safeName);
        const finalScreenshotUrl = await this.resolveFinalScreenshotUri(recordingDir, webview);
        const absArtifactPath =
          artifactPath !== undefined
            ? resolveVindicatePath(projectRoot, artifactPath)
            : path.join(projectRoot, ".vindicate", "recordings", `${safeName}.json`);
        const displayArtifactPath = toVindicateRelativePath(absArtifactPath, projectRoot);
        panel.postMessage({
          type: "recording_restored",
          status: "finalized",
          steps: artifact.steps.map((step) => {
            const absPath =
              step.screenshot_after !== undefined
                ? path.join(recordingDir, step.screenshot_after)
                : undefined;
            return this.resolveStepUris(step, absPath, webview);
          }),
          name,
          artifactPath: displayArtifactPath,
          sessionId: artifact.session_id ?? sessionId ?? safeName,
          safeName,
          started_by: artifact.started_by ?? startedBy,
          preconditionRecordings: artifact.depends_on ?? [],
          ...(finalScreenshotUrl !== undefined ? { finalScreenshotUrl } : {})
        });
      } catch (err) {
        postFailed(err instanceof Error ? err.message : "Failed to load recording");
      }
      return;
    }

    if (sessionId === undefined) {
      postFailed("Recording session not found.");
      return;
    }

    const state = await this.fetchRecordingState(sessionId);
    if (state.status === "none") {
      postFailed("Recording session is no longer available.");
      return;
    }

    const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
    const projectRootForSession = session?.projectRoot ?? projectRoot;
    if (projectRootForSession === undefined) {
      postFailed("No workspace folder open.");
      return;
    }
    const recordingSafeName = session?.safeName ?? safeName;
    const recordingDir = path.join(
      projectRootForSession,
      ".vindicate",
      "recordings",
      recordingSafeName
    );
    const finalScreenshotUrl =
      session?.thumbnailPath !== undefined
        ? this.toWebviewFileUri(webview, session.thumbnailPath)
        : await this.resolveFinalScreenshotUri(recordingDir, webview);
    panel.postMessage({
      type: "recording_restored",
      status: state.status === "finalized" ? "review" : state.status,
      steps: state.steps.map((step) => {
        const absPath =
          step.screenshot_after !== undefined
            ? path.join(recordingDir, step.screenshot_after)
            : undefined;
        return this.resolveStepUris(step, absPath, webview);
      }),
      name: state.name || name,
      sessionId,
      safeName: recordingSafeName,
      started_by: session?.started_by ?? startedBy,
      ...(session?.preconditionRecordings !== undefined
        ? { preconditionRecordings: session.preconditionRecordings }
        : {}),
      ...(finalScreenshotUrl !== undefined ? { finalScreenshotUrl } : {})
    });
  }

  private async handleWebviewMessage(
    panel: RecordingsDashboardPanel | RecordingPanel,
    msg: Record<string, unknown>
  ): Promise<void> {
    switch (msg["type"]) {
      case "list_recordings":
      case "refresh":
        await this.sendRecordingsList(panel);
        break;

      case "open_recording": {
        const artifactPath = asString(msg["artifactPath"]);
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (artifactPath !== undefined && projectRoot !== undefined) {
          const absPath = resolveVindicatePath(projectRoot, artifactPath);
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(absPath));
        }
        break;
      }

      case "load_recording_session":
        await this.loadRecordingSession(panel, msg);
        break;

      case "stop_recording": {
        const sessionId = asString(msg["sessionId"]);
        if (sessionId === undefined) {
          return;
        }
        await this.stopRecordingSession(sessionId);
        break;
      }

      case "take_snapshot": {
        const sessionId = asString(msg["sessionId"]);
        if (sessionId === undefined) {
          return;
        }
        await this.takeRecordingSnapshot(sessionId);
        break;
      }

      case "webview_client_error": {
        const source = asString(msg["source"]) ?? "unknown";
        const message = asString(msg["message"]) ?? "Unknown webview error";
        const stack = asString(msg["stack"]);
        const errorText = stack !== undefined ? `${message}\n${stack}` : message;
        console.error(`[recording-webview:${source}] ${errorText}`);
        const signature = `${source}:${message}`;
        if (this.shouldNotifyWebviewError(signature)) {
          void vscode.window.showErrorMessage(
            "Recording UI encountered an error. Reopen the recording panel and check logs if it persists."
          );
        }
        break;
      }

      case "start_recording": {
        const name = asString(msg["name"]);
        const targetUrl = asString(msg["targetUrl"]);
        const preconditionRecordings = Array.isArray(msg["preconditionRecordings"])
          ? msg["preconditionRecordings"].filter((v): v is string => typeof v === "string")
          : [];
        if (name === undefined || targetUrl === undefined) {
          return;
        }

        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        const nameConflict = findRecordingNameConflict(
          name,
          await this.listKnownRecordingSessions(projectRoot)
        );
        if (nameConflict !== null) {
          panel.postMessage({
            type: "playback_failed",
            error: formatRecordingNameConflictMessage(nameConflict),
            failedStep: 0,
            recordingName: ""
          });
          return;
        }

        const testidAttr = await this.getTestidAttr();
        const normalizedUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;

        let sessionRes: Response;
        try {
          sessionRes = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/browser/sessions`, {
            method: "POST",
            body: JSON.stringify({
              name,
              url: normalizedUrl,
              headless: false,
              testid_attr: testidAttr,
              project_root: projectRoot,
              viewport: { width: 1280, height: 800 }
            }),
            headers: { "Content-Type": "application/json", ...this.internalHeaders() }
          });
        } catch {
          panel.postMessage({
            type: "playback_failed",
            error: "Worker is offline",
            failedStep: 0,
            recordingName: ""
          });
          return;
        }

        if (!sessionRes.ok) {
          let detail: { error?: unknown; command?: unknown } = {};
          try {
            detail = (await sessionRes.json()) as typeof detail;
          } catch {
            /* body wasn't JSON — fall back to the generic message below */
          }
          panel.postMessage({
            type: "playback_failed",
            error:
              typeof detail.error === "string"
                ? detail.error
                : `Session creation failed: ${sessionRes.status}`,
            failedStep: 0,
            recordingName: "",
            ...(typeof detail.command === "string" ? { command: detail.command } : {})
          });
          return;
        }

        const { session_id: sessionId } = (await sessionRes.json()) as { session_id: string };

        this.sessionStore.upsert({
          id: sessionId,
          name,
          safeName: "",
          status: "recording",
          stepCount: 0,
          startedAt: new Date().toISOString(),
          projectRoot,
          started_by: "human",
          preconditionRecordings
        });

        try {
          if (preconditionRecordings.length > 0) {
            panel.postMessage({ type: "playback_started", total: preconditionRecordings.length });
            for (let i = 0; i < preconditionRecordings.length; i++) {
              const recordingName = preconditionRecordings[i]!;
              panel.postMessage({
                type: "playback_progress",
                current: i + 1,
                total: preconditionRecordings.length,
                recordingName
              });
              const playbackRes = await fetch(
                `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/playback`,
                {
                  method: "POST",
                  body: JSON.stringify({ recordingName }),
                  headers: { "Content-Type": "application/json", ...this.internalHeaders() }
                }
              );
              const result = (await playbackRes.json()) as {
                ok: boolean;
                error?: string;
                failedStep?: number;
              };
              if (!result.ok) {
                await this.discardRecordingSession(sessionId);
                panel.postMessage({
                  type: "playback_failed",
                  error: result.error ?? "Playback failed",
                  failedStep: result.failedStep ?? 0,
                  recordingName
                });
                return;
              }
            }
            panel.postMessage({ type: "playback_complete" });
          }

          const startRes = await fetch(
            `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/start`,
            {
              method: "POST",
              body: JSON.stringify({
                name,
                started_by: "human",
                ...(preconditionRecordings.length > 0 ? { skip_entry_navigate: true } : {})
              }),
              headers: { "Content-Type": "application/json", ...this.internalHeaders() }
            }
          );
          if (!startRes.ok) {
            throw new Error(`Recording start failed: ${startRes.status}`);
          }
        } catch (err) {
          await this.discardRecordingSession(sessionId);
          panel.postMessage({
            type: "playback_failed",
            error: err instanceof Error ? err.message : "Recording failed to start",
            failedStep: 0,
            recordingName: ""
          });
        }
        break;
      }

      case "finalize": {
        const steps = asRecordingSteps(msg["steps"]);
        const sessionId =
          panel instanceof RecordingPanel ? panel.sessionId : asString(msg["sessionId"]);
        const safeName = asString(msg["safeName"]);
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPanel = RecordingPanel.get(sessionId ?? "");
        const dashboard = RecordingsDashboardPanel.getCurrent();
        const postFailure = (error: string) => {
          if (dashboard !== undefined) {
            dashboard.postMessage({ type: "recording_finalize_failed", error });
          } else {
            targetPanel?.postMessage({ type: "recording_finalize_failed", error });
          }
        };
        const body = this.buildFinalizeBody(msg, steps, sessionId);

        let sessionActive = false;
        if (sessionId !== undefined) {
          const state = await this.fetchRecordingState(sessionId);
          sessionActive = state.status !== "none";
        }

        if (sessionActive && sessionId !== undefined) {
          try {
            const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
            const activeBody = {
              ...body,
              ...(session?.started_by !== "agent" ? { close_session: true } : {})
            };
            const res = await fetch(
              `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/finalize`,
              {
                method: "POST",
                body: JSON.stringify(activeBody),
                headers: { "Content-Type": "application/json", ...this.internalHeaders() }
              }
            );
            if (res.ok) {
              return;
            }
            let errorMsg = `Finalization failed: ${res.status}`;
            try {
              const errBody = (await res.json()) as { error?: string; message?: string };
              errorMsg = errBody.error ?? errBody.message ?? errorMsg;
            } catch {
              /* ignore parse error */
            }
            if (safeName === undefined || projectRoot === undefined) {
              postFailure(errorMsg);
              return;
            }
          } catch (err) {
            if (safeName === undefined || projectRoot === undefined) {
              postFailure(err instanceof Error ? err.message : "Finalization failed");
              return;
            }
          }
        }

        if (safeName === undefined || projectRoot === undefined) {
          postFailure(
            sessionActive
              ? "Finalization failed."
              : "Recording session is no longer available. Re-open the recording and try again."
          );
          return;
        }

        try {
          const res = await fetch(
            `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings/${encodeURIComponent(safeName)}/refinalize?project_root=${encodeURIComponent(projectRoot)}`,
            {
              method: "POST",
              body: JSON.stringify(body),
              headers: { "Content-Type": "application/json", ...this.internalHeaders() }
            }
          );
          if (!res.ok) {
            let errorMsg = `Finalization failed: ${res.status}`;
            try {
              const errBody = (await res.json()) as { error?: string; message?: string };
              errorMsg = errBody.error ?? errBody.message ?? errorMsg;
            } catch {
              /* ignore parse error */
            }
            postFailure(errorMsg);
          }
        } catch (err) {
          postFailure(err instanceof Error ? err.message : "Finalization failed");
        }
        break;
      }

      case "annotate": {
        const safeName = asString(msg["safeName"]);
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (safeName === undefined || projectRoot === undefined) {
          return;
        }
        try {
          const res = await fetch(
            `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings/${encodeURIComponent(safeName)}?project_root=${encodeURIComponent(projectRoot)}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                pre_conditions: asStringArray(msg["pre_conditions"]) ?? [],
                post_conditions: asStringArray(msg["post_conditions"]) ?? [],
                depends_on: asStringArray(msg["depends_on"]) ?? [],
                summary: asString(msg["summary"]) ?? ""
              }),
              headers: { "Content-Type": "application/json", ...this.internalHeaders() }
            }
          );
          if (res.ok) {
            await this.sendRecordingsList(panel);
            panel.postMessage({ type: "annotate_succeeded", safeName });
            return;
          }
          let errorMsg = `Annotation failed: ${res.status}`;
          try {
            const errBody = (await res.json()) as { error?: string; message?: string };
            errorMsg = errBody.error ?? errBody.message ?? errorMsg;
          } catch {
            /* ignore parse error */
          }
          panel.postMessage({ type: "annotate_failed", safeName, error: errorMsg });
        } catch (err) {
          panel.postMessage({
            type: "annotate_failed",
            safeName,
            error: err instanceof Error ? err.message : "Annotation failed"
          });
        }
        break;
      }

      case "discard": {
        const sessionId = asString(msg["sessionId"]);
        if (sessionId === undefined) {
          return;
        }
        try {
          const state = await this.fetchRecordingState(sessionId);
          if (state.status === "none") {
            this.postDiscardFailed(sessionId, "Recording session is no longer available.");
            return;
          }
          const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
          const res = await fetch(
            `http://127.0.0.1:${RUNTIME_PORT}/browser/sessions/${sessionId}/recording/discard`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...this.internalHeaders() },
              body: JSON.stringify({
                ...(session?.started_by !== "agent" ? { close_session: true } : {})
              })
            }
          );
          if (!res.ok) {
            let errorMsg = `Discard failed: ${res.status}`;
            try {
              const errBody = (await res.json()) as { error?: string; message?: string };
              errorMsg = errBody.error ?? errBody.message ?? errorMsg;
            } catch {
              /* ignore parse error */
            }
            this.postDiscardFailed(sessionId, errorMsg);
          }
        } catch (err) {
          this.postDiscardFailed(
            sessionId,
            err instanceof Error ? err.message : "Failed to discard recording"
          );
        }
        break;
      }

      case "delete_recording": {
        const safeName = asString(msg["safeName"]);
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (safeName === undefined || projectRoot === undefined) {
          this.postDiscardFailed("", "Cannot delete recording — workspace not available.");
          return;
        }
        try {
          const res = await fetch(
            `http://127.0.0.1:${RUNTIME_PORT}/browser/recordings/${encodeURIComponent(safeName)}?project_root=${encodeURIComponent(projectRoot)}`,
            { method: "DELETE", headers: this.internalHeaders() }
          );
          if (!res.ok) {
            let errorMsg = `Delete failed: ${res.status}`;
            try {
              const errBody = (await res.json()) as { error?: string; message?: string };
              errorMsg = errBody.error ?? errBody.message ?? errorMsg;
            } catch {
              /* ignore parse error */
            }
            this.postDiscardFailed("", errorMsg);
            return;
          }
          const stale = this.sessionStore
            .getAll()
            .find((s) => recordingSlugKey(s.safeName) === recordingSlugKey(safeName));
          if (stale !== undefined) {
            this.sessionStore.remove(stale.id);
          }
          RecordingsDashboardPanel.getCurrent()?.postMessage({ type: "recording_discarded" });
          void this.refreshRecordingsList();
        } catch (err) {
          this.postDiscardFailed(
            "",
            err instanceof Error ? err.message : "Failed to delete recording"
          );
        }
        break;
      }

      default:
        break;
    }
  }

  private async handleWorkerEvent(event: Record<string, unknown>): Promise<void> {
    const sessionId = asString(event["session_id"]);
    if (sessionId === undefined) {
      return;
    }

    switch (event["event"]) {
      case "recording_started": {
        const name = asString(event["name"]);
        const safeName = asString(event["safe_name"]);
        const projectRoot = asString(event["project_root"]);
        const startedBy = asString(event["started_by"]) === "agent" ? "agent" : "human";
        if (name === undefined || safeName === undefined || projectRoot === undefined) {
          return;
        }
        const existingSession = this.sessionStore.getAll().find((s) => s.id === sessionId);
        this.sessionStore.upsert({
          id: sessionId,
          name,
          safeName,
          status: "recording",
          stepCount: 0,
          startedAt: new Date().toISOString(),
          projectRoot,
          started_by: startedBy,
          ...(existingSession?.preconditionRecordings !== undefined
            ? { preconditionRecordings: existingSession.preconditionRecordings }
            : {})
        });
        const storedSession = this.sessionStore.getAll().find((s) => s.id === sessionId);
        const startedMessage = {
          type: "recording_started" as const,
          sessionId,
          name,
          safeName,
          started_by: startedBy,
          preconditionRecordings: storedSession?.preconditionRecordings ?? [],
          projectRoot
        };
        const dashboard = RecordingsDashboardPanel.getCurrent();
        if (dashboard !== undefined) {
          dashboard.postMessage(startedMessage);
        } else {
          const panel = RecordingPanel.getOrCreate(
            sessionId,
            this.context,
            this.extensionUri,
            projectRoot,
            name
          );
          panel.setMessageHandler((msg) => {
            void this.handleWebviewMessage(panel, msg);
          });
          panel.reveal();
          panel.postMessage(startedMessage);
        }
        break;
      }

      case "recording_step": {
        const stepRaw = event["step"];
        if (typeof stepRaw !== "object" || stepRaw === null) {
          return;
        }
        const step = stepRaw as RecordedStepPayload;
        const screenshotPath = asString(event["screenshot_path"]);
        this.bufferStep(sessionId, step, screenshotPath);
        const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
        const extra: Partial<SavedRecordingSession> = { stepCount: step.seq ?? 0 };
        if (screenshotPath !== undefined && session?.thumbnailPath === undefined) {
          extra.thumbnailPath = screenshotPath;
        }
        this.sessionStore.updateStatus(sessionId, "recording", extra);
        this.refreshRecordingsListIfVisible();
        break;
      }

      case "recording_stopped": {
        const screenshotPath = asString(event["screenshot_path"]);
        await this.publishRecordingStoppedToWebview(
          sessionId,
          screenshotPath !== undefined
            ? {
                screenshotPath,
                ...(event["final_snapshot"] !== undefined
                  ? { finalSnapshot: event["final_snapshot"] }
                  : {})
              }
            : event["final_snapshot"] !== undefined
              ? { finalSnapshot: event["final_snapshot"] }
              : undefined
        );
        break;
      }

      case "recording_finalized": {
        const artifactPath = asString(event["path"]);
        if (artifactPath === undefined) {
          return;
        }
        const session = this.sessionStore.getAll().find((s) => s.id === sessionId);
        const projectRoot =
          session?.projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const displayPath =
          projectRoot !== undefined
            ? toVindicateRelativePath(artifactPath, projectRoot)
            : artifactPath;
        const storePath =
          projectRoot !== undefined
            ? resolveVindicatePath(projectRoot, artifactPath)
            : artifactPath;
        this.sessionStore.updateStatus(sessionId, "finalized", { artifactPath: storePath });
        this.postToRecordingWebviews(sessionId, { type: "recording_finalized", path: displayPath });
        break;
      }

      case "recording_discarded": {
        this.sessionStore.remove(sessionId);
        RecordingPanel.get(sessionId)?.dispose();
        this.postToRecordingWebviews(sessionId, { type: "recording_discarded" });
        void this.refreshRecordingsList();
        break;
      }

      default:
        break;
    }
  }
}

import path from "node:path";
import fs from "node:fs/promises";
import type { Logger } from "pino";
import type { Frame, Page } from "playwright-core";

import type { IEventBus } from "../../../core/events/event-bus.interface.js";
import type { IBrowserBridge } from "../../../infrastructure/browser/browser-bridge.interface.js";
import type { ISessionStore } from "../session/session.store.interface.js";
import { resolveProjectPath } from "../../files/path-guard.js";
import {
  toVindicateRelativePath,
  type RecordingArtifact,
  type RecordedStep,
  type StructuredLocator
} from "@vindicate/protocol";
import {
  classifyNavigation,
  isRealPageUrl,
  shouldSkipDuplicateNavigateStep,
  shouldSuppressAgentDomEvent
} from "./recording-agent-capture.js";
import { buildRecorderScript } from "./recording-capture.evaluate.js";
import { captureRecordingPageSnapshot } from "./recording-page-snapshot.evaluate.js";
import {
  SCREENSHOT_STEP_ACTIONS,
  screenshotWithoutOverlay,
  waitForFinalScreenshotSettle,
  waitForStepScreenshotSettle
} from "./recording-screenshot.js";
import { RECORDER_HOST_ID } from "./recording-overlay.constants.js";
import { buildTestidCandidates } from "../snapshot/snapshot-engine.js";
import { computeFramePathForFrame } from "../snapshot/frame-capture.js";
import type { SettleConfigSlice } from "../snapshot/settle-detector.js";
import { RecordingStore } from "./recording.store.js";
import { RecordingsIndexService } from "./recordings-index.service.js";
import type {
  AgentStepPayload,
  FinalizeRecordingData,
  RecordingEventPayload,
  RecordingPageSnapshot,
  RecordingSessionState,
  RecordingStep,
  SelectorCandidatePayload
} from "./recording.types.js";

const DEFAULT_SETTLE_CFG: SettleConfigSlice = {
  VINDICATE_SETTLE_NETWORK_MS: 5_000,
  VINDICATE_SETTLE_TIMEOUT_MS: 10_000
};

const IMPLICIT_NAV_TRIGGER_WINDOW_MS = 12_000;

function asSelectorCandidate(
  value: unknown
):
  | { strategy: string; value: string; attr?: string; strength?: "strong" | "medium" | "weak" }
  | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.strategy !== "string" || typeof candidate.value !== "string") {
    return undefined;
  }
  return {
    strategy: candidate.strategy,
    value: candidate.value,
    ...(typeof candidate.attr === "string" ? { attr: candidate.attr } : {}),
    ...(candidate.strength === "strong" ||
    candidate.strength === "medium" ||
    candidate.strength === "weak"
      ? { strength: candidate.strength }
      : {})
  };
}

function toRecordingEventPayload(
  payload: Record<string, unknown>
): RecordingEventPayload | undefined {
  if (typeof payload.action !== "string") {
    return undefined;
  }
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
        .map((candidate) => asSelectorCandidate(candidate))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    : [];
  const chosen = asSelectorCandidate(payload.chosen) ?? null;
  const elementRaw = payload.element;
  const element =
    typeof elementRaw === "object" && elementRaw !== null
      ? (() => {
          const el = elementRaw as Record<string, unknown>;
          if (typeof el.tag !== "string") {
            return undefined;
          }
          return {
            tag: el.tag,
            ...(typeof el.role === "string" ? { role: el.role } : {}),
            ...(typeof el.name === "string" ? { name: el.name } : {}),
            ...(typeof el.id === "string" ? { id: el.id } : {}),
            ...(typeof el.placeholder === "string" ? { placeholder: el.placeholder } : {})
          };
        })()
      : undefined;
  const targetRaw = payload.target;
  const target =
    typeof targetRaw === "object" && targetRaw !== null
      ? (() => {
          const t = targetRaw as Record<string, unknown>;
          const targetCandidates = Array.isArray(t.candidates)
            ? t.candidates
                .map((candidate) => asSelectorCandidate(candidate))
                .filter(
                  (candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined
                )
            : undefined;
          const targetChosen = asSelectorCandidate(t.chosen) ?? null;
          const targetElementRaw = t.element;
          const targetElement =
            typeof targetElementRaw === "object" && targetElementRaw !== null
              ? (() => {
                  const el = targetElementRaw as Record<string, unknown>;
                  if (typeof el.tag !== "string") {
                    return undefined;
                  }
                  return {
                    tag: el.tag,
                    ...(typeof el.role === "string" ? { role: el.role } : {}),
                    ...(typeof el.name === "string" ? { name: el.name } : {}),
                    ...(typeof el.id === "string" ? { id: el.id } : {}),
                    ...(typeof el.placeholder === "string" ? { placeholder: el.placeholder } : {})
                  };
                })()
              : undefined;
          return {
            ...(targetCandidates !== undefined ? { candidates: targetCandidates } : {}),
            chosen: targetChosen,
            ...(targetElement !== undefined ? { element: targetElement } : {})
          };
        })()
      : undefined;
  const files = Array.isArray(payload.files)
    ? payload.files.filter((f): f is string => typeof f === "string")
    : undefined;
  return {
    action: payload.action,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString(),
    candidates,
    chosen,
    ...(element !== undefined ? { element } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(files !== undefined && files.length > 0 ? { files } : {}),
    ...(typeof payload.text === "string" ? { text: payload.text } : {}),
    ...(typeof payload.url === "string" ? { url: payload.url } : {}),
    ...(typeof payload.key === "string" ? { key: payload.key } : {}),
    ...(payload["navigation_trigger"] === "explicit" || payload["navigation_trigger"] === "implicit"
      ? { navigation_trigger: payload["navigation_trigger"] }
      : {}),
    ...(payload["env_var"] === true ? { env_var: true } : {}),
    ...(typeof payload["env_var_name"] === "string"
      ? { env_var_name: payload["env_var_name"] }
      : {})
  };
}

function isNavigationTriggerAction(
  payload: RecordingEventPayload
): payload is RecordingEventPayload & {
  action: "click" | "dblclick" | "press_key";
} {
  if (payload.action === "click" || payload.action === "dblclick") {
    return true;
  }
  if (payload.action === "press_key") {
    return payload.key === "Enter";
  }
  return false;
}

export class RecordingService {
  private readonly store = new RecordingStore();

  constructor(
    private readonly bridge: IBrowserBridge,
    private readonly sessionStore: ISessionStore,
    private readonly eventBus: IEventBus,
    private readonly logger: Logger,
    private readonly settleCfg: SettleConfigSlice = DEFAULT_SETTLE_CFG
  ) {}

  async start(
    sessionId: string,
    name: string,
    projectRoot: string,
    options?: {
      testidAttr?: string;
      started_by?: "human" | "agent";
      /** When pre-conditions were replayed, the browser is already on the target page — skip entry navigate. */
      skip_entry_navigate?: boolean;
    }
  ): Promise<void> {
    if (this.store.get(sessionId) !== undefined) {
      this.logger.warn({ sessionId }, "[recording] already active for session, ignoring start");
      return;
    }

    const testidAttr = options?.testidAttr;
    const startedBy = options?.started_by ?? "human";
    const testidCandidates = buildTestidCandidates(testidAttr);
    const preferredTestidAttr = testidAttr ?? testidCandidates[0] ?? "data-testid";
    const state = this.store.create(sessionId, name, projectRoot, preferredTestidAttr, startedBy);

    await this.bridge.setupRecording(sessionId, async (payload, source) => {
      if (payload["event"] === "__stop_requested") {
        await this.stop(sessionId);
        return;
      }
      if (payload["event"] === "__paused") {
        const recordingState = this.store.get(sessionId);
        if (recordingState !== undefined) {
          recordingState.paused = payload["paused"] === true;
          this.broadcastPausedState(sessionId, recordingState.paused);
        }
        return;
      }
      const eventPayload = toRecordingEventPayload(payload);
      if (eventPayload === undefined) {
        this.logger.warn({ sessionId, payload }, "[recording] dropped invalid event payload");
        return;
      }
      await this.handleEvent(sessionId, eventPayload, source.frame, source.page);
    });

    const page = await this.bridge.getPage(sessionId);
    const entryUrl = page.url();
    if (isRealPageUrl(entryUrl)) {
      state.currentUrl = entryUrl;
    }

    page.on("framenavigated", (frame) => {
      void (async () => {
        if (frame !== page.mainFrame()) {
          return;
        }
        const recordingState = this.store.get(sessionId);
        if (recordingState === undefined || recordingState.status !== "recording") {
          return;
        }
        if (recordingState.started_by === "agent") {
          return;
        }
        if (recordingState.paused === true) {
          return;
        }
        if (recordingState.steps.length === 0) {
          return;
        }
        const newUrl = frame.url();
        if (shouldSkipDuplicateNavigateStep(recordingState.steps, newUrl)) {
          return;
        }

        const preNavUrl = recordingState.currentUrl;
        const nowMs = Date.now();
        const navigationTrigger = this.classifyNavigationTriggerForFrameNav(
          recordingState,
          nowMs,
          newUrl
        );

        if (
          navigationTrigger === "implicit" &&
          preNavUrl !== undefined &&
          recordingState.lastPageSnapshot?.url === preNavUrl &&
          !this.shouldSkipPreNavSnapshotInsert(recordingState, preNavUrl)
        ) {
          this.insertBufferedPreNavSnapshot(sessionId, recordingState, preNavUrl);
        }

        recordingState.currentUrl = newUrl;

        await this.handleEvent(
          sessionId,
          {
            action: "navigate",
            url: newUrl,
            timestamp: new Date().toISOString(),
            candidates: [],
            chosen: null,
            navigation_trigger: navigationTrigger,
            actor: "human"
          },
          undefined,
          page
        );
      })();
    });

    this.registerPopupTracking(sessionId);

    if (startedBy !== "agent") {
      const script = buildRecorderScript(testidCandidates);
      await this.bridge.injectScript(sessionId, script);
    }

    if (isRealPageUrl(entryUrl)) {
      if (options?.skip_entry_navigate === true) {
        state.currentUrl = entryUrl;
      } else {
        await this.handleEvent(
          sessionId,
          {
            action: "navigate",
            url: entryUrl,
            timestamp: new Date().toISOString(),
            candidates: [],
            chosen: null,
            navigation_trigger: "explicit",
            actor: startedBy === "agent" ? "agent" : "human"
          },
          undefined,
          page
        );
      }
    }

    this.eventBus.publish({
      event: "recording_started",
      session_id: sessionId,
      name: state.name,
      safe_name: state.safeName,
      project_root: projectRoot,
      started_by: startedBy
    });

    this.logger.info({ sessionId, name }, "[recording] started");
  }

  /**
   * Each open page mounts its own independent recorder banner (own local `paused` flag, own visual
   * state) — pausing from one page's banner only updates that page's own UI locally before this method
   * runs. Pushes the real, server-side paused state out to every other open page so their banners never
   * lie about whether the session is actually capturing, and so their own local `paused` flag correctly
   * self-gates their click/fill listeners too (otherwise a page whose banner still says "Recording…"
   * would keep emitting events the server silently drops, misleading whoever is looking at it).
   *
   * Uses `__vindicateApplyPausedState`, not `__vindicateSetRecorderPaused` — the latter re-emits a `__paused`
   * event back to the server on every call, which would turn this broadcast into an infinite loop between
   * server and pages. Best-effort and fire-and-forget: a page mid-navigation failing to receive the sync
   * is a stale banner, never a reason to fail the pause toggle itself.
   */
  private broadcastPausedState(sessionId: string, paused: boolean): void {
    let openPages: Page[];
    try {
      openPages = this.bridge
        .getContext(sessionId)
        .pages()
        .filter((p) => !p.isClosed());
    } catch (err: unknown) {
      this.logger.warn(
        { err, sessionId },
        "[recording] paused-state broadcast: no context — skipping"
      );
      return;
    }
    for (const p of openPages) {
      p.evaluate((isPaused: boolean) => {
        const w = window as Window & { __vindicateApplyPausedState?: (paused: boolean) => void };
        w.__vindicateApplyPausedState?.(isPaused);
      }, paused).catch((err: unknown) => {
        this.logger.warn(
          { err, sessionId },
          "[recording] paused-state broadcast to a page failed — continuing"
        );
      });
    }
  }

  /**
   * A human recording has no way to know a popup is about to open — unlike the agent, which is expected
   * to call `switch_tab_by_url` itself and gets recorded via `addAgentStep` (see agent-step-builder.ts).
   * `context.on('page')` is the only proactive signal available: it fires the instant a new page exists,
   * even if the human never interacts inside it before it redirects/closes on its own (e.g. an OAuth
   * bounce window that opens and closes with nothing to click) — that case would otherwise leave zero
   * trace in the recording, since `attributePageIfChanged` (the per-event mechanism below) only fires
   * from an actual event, and a page nobody interacts with never produces one. Registered unconditionally;
   * `attributePageIfChanged` itself no-ops for agent recordings so the two mechanisms never double-record.
   *
   * Deliberately synchronous — no `waitForLoadState` wait before attributing. Two reasons: (1) the page's
   * own recorder script (context-scoped `addInitScript`/`exposeBinding`) is already live and can emit a
   * real DOM event from inside this popup at any moment, independently of this listener; waiting here
   * before recording the "switched to" step would race that real event and could let it jump the queue.
   * (2) `attributePageIfChanged` is exactly what a same-tick DOM event from this same page would also run
   * — calling it immediately here means whichever fires first (this listener or a fast click inside the
   * popup) produces the same result via the same code path, not two different ones that could disagree.
   */
  private registerPopupTracking(sessionId: string): void {
    const context = this.bridge.getContext(sessionId);
    context.on("page", (newPage) => {
      const state = this.store.get(sessionId);
      if (state === undefined || state.status !== "recording") {
        return;
      }
      void this.attributePageIfChanged(sessionId, state, newPage).catch((err: unknown) => {
        this.logger.warn({ err, sessionId }, "[recording] popup-open attribution failed");
      });
    });
  }

  /**
   * The single mechanism that decides "did recording activity move to a different page?" and, if so,
   * syncs the session's tab-tracking state and records a `switch_tab_by_url` step before anything else
   * happens. Called both from the popup-open listener above (for a page that opens but is never
   * interacted with) and from `handleEvent` itself (for every real event, so a popup interacted with
   * immediately, or focus returning to an already-open page without it ever closing, are both covered by
   * the same code path — no second, competing mechanism to keep in sync).
   *
   * No-ops for agent recordings: the agent already records its own explicit `new_tab`/`switch_tab`/
   * `switch_tab_by_url` calls via `addAgentStep` (see agent-step-builder.ts), and the browser-side
   * recorder script that would otherwise emit raw DOM events is never injected for agent sessions in the
   * first place — there is nothing here for an agent session to attribute.
   */
  private async attributePageIfChanged(
    sessionId: string,
    state: RecordingSessionState,
    page: Page
  ): Promise<void> {
    if (state.started_by === "agent") {
      return;
    }
    if (state.lastEventPage === page) {
      return;
    }
    const isFirstAttributedEvent = state.lastEventPage === undefined;
    state.lastEventPage = page;
    if (isFirstAttributedEvent) {
      // Nothing to "switch" from — this is simply where the recording started.
      return;
    }
    if (page.isClosed()) {
      return;
    }

    const context = this.bridge.getContext(sessionId);
    const openPages = context.pages().filter((p) => !p.isClosed());
    const newIndex = openPages.indexOf(page);
    if (newIndex < 0) {
      return;
    }

    // Sync the session's own tab-tracking state — without this, getPage(sessionId) (used by every
    // screenshot/snapshot capture) would keep silently targeting whichever page was active before this
    // switch, for the rest of the recording: a human interacting inside a site-opened payment popup, or
    // back on the main page after it, would have every subsequent Snapshot/Stop screenshot capture the
    // wrong page.
    this.bridge.getTabState(sessionId).activePageIndex = newIndex;

    await this.handleEvent(sessionId, {
      action: "switch_tab_by_url",
      url: page.url(),
      timestamp: new Date().toISOString(),
      candidates: [],
      chosen: null,
      navigation_trigger: "implicit",
      actor: "human"
    });
  }

  /**
   * Attaches `frame_path` to every candidate (and the drag target's, if present) when the DOM event
   * fired inside a nested iframe — `computeFramePathForFrame` itself is a cheap no-op (zero extra
   * Playwright calls) for the overwhelming common case of a top-frame event, so this is called
   * unconditionally rather than trying to pre-filter. Best-effort: a failed derivation returns the
   * payload unchanged rather than dropping the recorded event.
   */
  private async attachFramePath(
    state: RecordingSessionState,
    payload: RecordingEventPayload,
    frame: Frame
  ): Promise<RecordingEventPayload> {
    if (payload.candidates.length === 0 && payload.chosen == null && payload.target === undefined) {
      return payload;
    }
    let framePath: StructuredLocator[];
    try {
      framePath = await computeFramePathForFrame(frame, {
        testidCandidates: buildTestidCandidates(state.testidAttr)
      });
    } catch (err: unknown) {
      this.logger.warn(
        { err, sessionId: state.sessionId },
        "[recording] frame_path derivation failed — continuing"
      );
      return payload;
    }
    if (framePath.length === 0) {
      return payload;
    }

    const withFramePath = (c: SelectorCandidatePayload): SelectorCandidatePayload => ({
      ...c,
      frame_path: framePath
    });

    return {
      ...payload,
      candidates: payload.candidates.map(withFramePath),
      chosen: payload.chosen != null ? withFramePath(payload.chosen) : payload.chosen,
      ...(payload.target !== undefined
        ? {
            target: {
              ...payload.target,
              ...(payload.target.candidates !== undefined
                ? { candidates: payload.target.candidates.map(withFramePath) }
                : {}),
              ...(payload.target.chosen != null
                ? { chosen: withFramePath(payload.target.chosen) }
                : {})
            }
          }
        : {})
    };
  }

  private dedupClicksBeforeDblclick(sessionId: string, payload: RecordingEventPayload): void {
    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }
    const sameTarget = (step: RecordingSessionState["steps"][number]): boolean =>
      step.action === "click" &&
      step.chosen?.value === payload.chosen?.value &&
      step.chosen?.strategy === payload.chosen?.strategy;
    while (state.steps.length > 0 && sameTarget(state.steps[state.steps.length - 1]!)) {
      state.steps.pop();
    }
  }

  private async handleEvent(
    sessionId: string,
    payload: RecordingEventPayload,
    frame?: Frame,
    page?: Page
  ): Promise<void> {
    const recordingState = this.store.get(sessionId);
    if (recordingState === undefined || recordingState.status !== "recording") {
      return;
    }
    if (recordingState.paused === true) {
      return;
    }

    // Attribute a page change *before* processing the real event — so a Snapshot click, a click inside a
    // just-opened popup, or focus returning to an already-open page all get a `switch_tab_by_url` step
    // ahead of whatever actually happened, never after. `page` is only ever passed from the real browser
    // event channel (never from a synthesized step, which would otherwise re-enter this indefinitely).
    if (page !== undefined) {
      await this.attributePageIfChanged(sessionId, recordingState, page);
    }

    if (payload.action === "snapshot") {
      await this.handleManualSnapshot(sessionId, payload);
      return;
    }

    if (
      payload.action === "navigate" &&
      shouldSkipDuplicateNavigateStep(recordingState.steps, payload.url)
    ) {
      return;
    }

    if (shouldSuppressAgentDomEvent(recordingState.started_by, payload.action)) {
      return;
    }

    if (payload.action === "dblclick") {
      this.dedupClicksBeforeDblclick(sessionId, payload);
    }

    const framedPayload =
      frame !== undefined ? await this.attachFramePath(recordingState, payload, frame) : payload;

    const seq = this.store.addStep(sessionId, {
      ...framedPayload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
      actor: payload.actor ?? "human"
    });
    if (seq < 0) {
      return;
    }

    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }
    const step = state.steps[seq - 1];
    if (step === undefined) {
      return;
    }

    if (payload.action === "navigate") {
      delete state.pendingNavigationTrigger;
    } else if (state.started_by !== "agent" && isNavigationTriggerAction(payload)) {
      state.pendingNavigationTrigger = {
        seq,
        action: payload.action,
        timestampMs: Date.parse(step.timestamp),
        ...(state.currentUrl !== undefined ? { urlBefore: state.currentUrl } : {})
      };
    }

    if (SCREENSHOT_STEP_ACTIONS.has(payload.action)) {
      void this.takeStepScreenshot(sessionId, seq, state, payload.action)
        .then(() => {
          this.publishStepUpdate(sessionId, seq);
        })
        .catch((err: unknown) => {
          this.logger.warn({ err, sessionId, seq }, "[recording] deferred step screenshot failed");
        });
    }

    this.publishStepUpdate(sessionId, seq);
  }

  private publishStepUpdate(sessionId: string, seq: number): void {
    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }
    const step = state.steps[seq - 1];
    if (step === undefined) {
      return;
    }

    this.eventBus.publish({
      event: "recording_step",
      session_id: sessionId,
      step: { ...step },
      screenshot_path: step.screenshot_after
        ? path.join(
            state.projectRoot,
            ".vindicate",
            "recordings",
            state.safeName,
            step.screenshot_after
          )
        : undefined
    });
  }

  private async handleManualSnapshot(
    sessionId: string,
    payload: RecordingEventPayload
  ): Promise<void> {
    const seq = this.store.addStep(sessionId, {
      action: "snapshot",
      timestamp: payload.timestamp ?? new Date().toISOString(),
      candidates: [],
      chosen: null,
      ...(payload.url !== undefined ? { url: payload.url } : {})
    });
    if (seq < 0) {
      return;
    }

    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }

    try {
      const page = await this.bridge.getPage(sessionId);
      await waitForStepScreenshotSettle(page, "snapshot", this.settleCfg);
      const pageSnapshot = await this.capturePageSnapshot(page, state);
      if (pageSnapshot !== undefined) {
        this.store.updateStepPageSnapshot(sessionId, seq, pageSnapshot);
      }

      const screenshotDir = path.join(
        state.projectRoot,
        ".vindicate",
        "recordings",
        state.safeName
      );
      await fs.mkdir(screenshotDir, { recursive: true });
      const screenshotFile = `step-${String(seq).padStart(3, "0")}.png`;
      await screenshotWithoutOverlay(page, {
        path: path.join(screenshotDir, screenshotFile),
        type: "png"
      });
      this.store.updateStepScreenshot(sessionId, seq, screenshotFile);
    } catch (err: unknown) {
      this.logger.warn({ err, sessionId, seq }, "[recording] manual snapshot failed — continuing");
    }

    const step = this.store.get(sessionId)?.steps[seq - 1];
    if (step === undefined) {
      return;
    }

    this.eventBus.publish({
      event: "recording_step",
      session_id: sessionId,
      step: { ...step },
      screenshot_path: step.screenshot_after
        ? path.join(
            state.projectRoot,
            ".vindicate",
            "recordings",
            state.safeName,
            step.screenshot_after
          )
        : undefined
    });
  }

  private async takeStepScreenshot(
    sessionId: string,
    seq: number,
    state: RecordingSessionState,
    action: string
  ): Promise<void> {
    try {
      const page = await this.bridge.getPage(sessionId);
      await waitForStepScreenshotSettle(page, action, this.settleCfg);
      const screenshotDir = path.join(
        state.projectRoot,
        ".vindicate",
        "recordings",
        state.safeName
      );
      await fs.mkdir(screenshotDir, { recursive: true });
      const screenshotFile = `step-${String(seq).padStart(3, "0")}.png`;
      const screenshotPath = path.join(screenshotDir, screenshotFile);
      await screenshotWithoutOverlay(page, { path: screenshotPath, type: "png" });
      this.store.updateStepScreenshot(sessionId, seq, screenshotFile);

      if (state.paused !== true) {
        await this.refreshPageSnapshotBuffer(sessionId, state, page, 80);
      }
    } catch (err: unknown) {
      this.logger.warn({ err, sessionId, seq }, "[recording] screenshot failed — continuing");
    }
  }

  async stop(sessionId: string): Promise<void> {
    const state = this.store.get(sessionId);
    if (state === undefined || state.status !== "recording") {
      return;
    }

    const stopped = this.store.stop(sessionId);
    if (!stopped) {
      return;
    }

    const session = this.sessionStore.get(sessionId);
    if (session !== undefined && session.status === "active") {
      await this.sessionStore.applyTrigger(sessionId, "pause");
    }

    const screenshotPath = await this.takeFinalScreenshot(sessionId, state);

    this.eventBus.publish({
      event: "recording_stopped",
      session_id: sessionId,
      ...(screenshotPath !== undefined ? { screenshot_path: screenshotPath } : {}),
      ...(state.finalSnapshot !== undefined ? { final_snapshot: state.finalSnapshot } : {})
    });
    this.logger.info({ sessionId }, "[recording] stopped — awaiting user review");
  }

  async takeManualSnapshot(sessionId: string): Promise<void> {
    const state = this.store.get(sessionId);
    if (state === undefined || state.status !== "recording") {
      return;
    }
    await this.handleManualSnapshot(sessionId, {
      action: "snapshot",
      timestamp: new Date().toISOString(),
      candidates: [],
      chosen: null,
      ...(state.currentUrl !== undefined ? { url: state.currentUrl } : {})
    });
  }

  private async takeFinalScreenshot(
    sessionId: string,
    state: RecordingSessionState
  ): Promise<string | undefined> {
    try {
      const page = await this.bridge.getPage(sessionId);
      await waitForFinalScreenshotSettle(page, this.settleCfg);
      const pageSnapshot = await this.capturePageSnapshot(page, state);
      if (pageSnapshot !== undefined) {
        state.finalSnapshot = pageSnapshot;
      }
      const screenshotDir = path.join(
        state.projectRoot,
        ".vindicate",
        "recordings",
        state.safeName
      );
      await fs.mkdir(screenshotDir, { recursive: true });
      const screenshotFile = "final.png";
      const screenshotPath = path.join(screenshotDir, screenshotFile);
      await screenshotWithoutOverlay(page, { path: screenshotPath, type: "png" });
      await page
        .evaluate(() => {
          const w = window as Window & {
            __vindicateSetRecorderStoppedUi?: () => void;
          };
          w.__vindicateSetRecorderStoppedUi?.();
        })
        .catch(() => {});
      return screenshotPath;
    } catch (err: unknown) {
      this.logger.warn({ err, sessionId }, "[recording] final screenshot failed — continuing");
      return undefined;
    }
  }

  async addAgentStep(sessionId: string, payload: AgentStepPayload): Promise<void> {
    const stepPayload: RecordingEventPayload = {
      action: payload.action,
      timestamp: payload.timestamp,
      actor: "agent",
      chosen: payload.chosen,
      candidates: payload.candidates,
      ...(payload.element !== undefined ? { element: payload.element } : {}),
      ...(payload.text !== undefined ? { text: payload.text } : {}),
      ...(payload.url !== undefined ? { url: payload.url } : {}),
      ...(payload.key !== undefined ? { key: payload.key } : {}),
      ...(payload.action === "navigate" ? { navigation_trigger: "explicit" as const } : {})
    };
    const seq = this.store.addStep(sessionId, stepPayload);
    if (seq < 0) {
      return;
    }

    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }
    if (payload.action === "navigate" && payload.url !== undefined) {
      state.currentUrl = payload.url;
    }

    if (SCREENSHOT_STEP_ACTIONS.has(payload.action)) {
      await this.takeStepScreenshot(sessionId, seq, state, payload.action);
    }

    const step = state.steps[seq - 1];
    if (step === undefined) {
      return;
    }

    this.eventBus.publish({
      event: "recording_step",
      session_id: sessionId,
      step: { ...step },
      screenshot_path: step.screenshot_after
        ? path.join(
            state.projectRoot,
            ".vindicate",
            "recordings",
            state.safeName,
            step.screenshot_after
          )
        : undefined
    });
  }

  async addAgentImplicitNavigate(sessionId: string, url: string): Promise<void> {
    const state = this.store.get(sessionId);
    if (state === undefined || state.status !== "recording" || state.started_by !== "agent") {
      return;
    }
    if (url.length === 0 || shouldSkipDuplicateNavigateStep(state.steps, url)) {
      return;
    }
    state.currentUrl = url;
    await this.handleEvent(sessionId, {
      action: "navigate",
      url,
      timestamp: new Date().toISOString(),
      candidates: [],
      chosen: null,
      navigation_trigger: "implicit",
      actor: "agent"
    });
  }

  async deleteArtifact(projectRoot: string, safeName: string): Promise<void> {
    const recordingsDir = path.join(projectRoot, ".vindicate", "recordings");
    const screenshotDir = resolveProjectPath(recordingsDir, safeName);
    const artifactPath = resolveProjectPath(recordingsDir, `${safeName}.json`);
    await fs.rm(screenshotDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(artifactPath, { force: true }).catch(() => {});
    await RecordingsIndexService.remove(projectRoot, safeName).catch(() => {});
  }

  async discard(sessionId: string): Promise<void> {
    const state = this.store.get(sessionId);
    if (state === undefined) {
      return;
    }
    this.store.delete(sessionId);
    await this.deleteArtifact(state.projectRoot, state.safeName);
    this.eventBus.publish({ event: "recording_discarded", session_id: sessionId });
  }

  async finalize(
    sessionId: string,
    finalizedData?: FinalizeRecordingData
  ): Promise<{ path: string; name: string; safe_name: string }> {
    const state = this.store.get(sessionId);
    if (state === undefined) {
      throw new Error(`No recording found for session ${sessionId}`);
    }

    const editedSteps = finalizedData?.editedSteps;
    if (editedSteps !== undefined && editedSteps.length > 0) {
      this.store.replaceSteps(sessionId, this.mergeEditedSteps(state.steps, editedSteps));
    }

    const finalState = this.store.finalize(sessionId);
    if (finalState === undefined) {
      throw new Error(`No recording found for session ${sessionId}`);
    }

    const humanSteps = finalState.steps.filter((s) => (s.actor ?? "human") === "human").length;
    const agentSteps = finalState.steps.filter((s) => s.actor === "agent").length;
    const pagesCovered = [...new Set(finalState.steps.filter((s) => s.url).map((s) => s.url!))];

    const artifactSteps = finalState.steps.map((step) => ({
      seq: step.seq,
      action: step.action as RecordedStep["action"],
      timestamp: step.timestamp,
      ...(step.text !== undefined ? { text: step.text } : {}),
      ...(step.url !== undefined ? { url: step.url } : {}),
      ...(step.key !== undefined ? { key: step.key } : {}),
      chosen: step.chosen,
      candidates: step.candidates,
      ...(step.element !== undefined ? { element: step.element } : {}),
      ...(step.screenshot_after !== undefined ? { screenshot_after: step.screenshot_after } : {}),
      ...(step.page_snapshot !== undefined ? { page_snapshot: step.page_snapshot } : {}),
      ...(step.actor !== undefined ? { actor: step.actor } : {}),
      ...(step.navigation_trigger !== undefined
        ? { navigation_trigger: step.navigation_trigger }
        : {}),
      ...(step.env_var === true ? { env_var: true } : {}),
      ...(step.env_var_name !== undefined ? { env_var_name: step.env_var_name } : {})
    })) as RecordedStep[];

    const artifact = {
      name: finalState.name,
      recorded_at: finalState.startedAt,
      session_id: finalState.sessionId,
      project_root: finalState.projectRoot,
      status: "finalized" as const,
      steps: artifactSteps,
      ...(finalState.finalSnapshot !== undefined
        ? { final_snapshot: finalState.finalSnapshot }
        : {}),
      started_by: finalState.started_by,
      actor_summary: { human: humanSteps, agent: agentSteps },
      pre_conditions: finalizedData?.pre_conditions ?? [],
      post_conditions: finalizedData?.post_conditions ?? [],
      depends_on: finalizedData?.depends_on ?? [],
      pages_covered: pagesCovered,
      summary: finalizedData?.summary ?? ""
    } as RecordingArtifact;

    const recordingsDir = path.join(finalState.projectRoot, ".vindicate", "recordings");
    await fs.mkdir(recordingsDir, { recursive: true });
    const artifactPath = path.join(recordingsDir, `${finalState.safeName}.json`);
    await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf-8");

    const screenshotDir = path.join(
      finalState.projectRoot,
      ".vindicate",
      "recordings",
      finalState.safeName
    );
    const thumbCandidatePath = path.join(screenshotDir, "step-001.png");
    let thumbnail_path: string | undefined;
    try {
      await fs.access(thumbCandidatePath);
      thumbnail_path = thumbCandidatePath;
    } catch {
      /* no first screenshot */
    }

    const indexPath = toVindicateRelativePath(artifactPath, finalState.projectRoot);

    await RecordingsIndexService.upsert(finalState.projectRoot, {
      name: finalState.name,
      safe_name: finalState.safeName,
      path: indexPath,
      summary: artifact.summary ?? "",
      pre_conditions: artifact.pre_conditions ?? [],
      post_conditions: artifact.post_conditions ?? [],
      depends_on: artifact.depends_on ?? [],
      pages_covered: artifact.pages_covered ?? [],
      started_by: artifact.started_by ?? "human",
      recorded_at: finalState.startedAt,
      step_count: finalState.steps.length,
      status: "finalized",
      thumbnail_path
    });

    this.eventBus.publish({
      event: "recording_finalized",
      session_id: sessionId,
      name: finalState.name,
      safe_name: finalState.safeName,
      path: indexPath
    });

    this.logger.info({ sessionId, artifactPath }, "[recording] finalized");
    return { path: indexPath, name: finalState.name, safe_name: finalState.safeName };
  }

  async refinalizeArtifact(
    projectRoot: string,
    safeName: string,
    finalizedData?: FinalizeRecordingData
  ): Promise<{ path: string; name: string; safe_name: string }> {
    const recordingsDir = path.join(projectRoot, ".vindicate", "recordings");
    const artifactPath = resolveProjectPath(recordingsDir, `${safeName}.json`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const existing = JSON.parse(raw) as RecordingArtifact;

    const mergedSteps =
      finalizedData?.editedSteps !== undefined && finalizedData.editedSteps.length > 0
        ? this.mergeEditedSteps(existing.steps as RecordingStep[], finalizedData.editedSteps)
        : (existing.steps as RecordingStep[]);

    const humanSteps = mergedSteps.filter((s) => (s.actor ?? "human") === "human").length;
    const agentSteps = mergedSteps.filter((s) => s.actor === "agent").length;
    const pagesCovered = [...new Set(mergedSteps.filter((s) => s.url).map((s) => s.url!))];

    const artifactSteps = mergedSteps.map((step) => ({
      seq: step.seq,
      action: step.action as RecordedStep["action"],
      timestamp: step.timestamp,
      ...(step.text !== undefined ? { text: step.text } : {}),
      ...(step.url !== undefined ? { url: step.url } : {}),
      ...(step.key !== undefined ? { key: step.key } : {}),
      chosen: step.chosen,
      candidates: step.candidates,
      ...(step.element !== undefined ? { element: step.element } : {}),
      ...(step.screenshot_after !== undefined ? { screenshot_after: step.screenshot_after } : {}),
      ...(step.page_snapshot !== undefined ? { page_snapshot: step.page_snapshot } : {}),
      ...(step.actor !== undefined ? { actor: step.actor } : {}),
      ...(step.navigation_trigger !== undefined
        ? { navigation_trigger: step.navigation_trigger }
        : {}),
      ...(step.env_var === true ? { env_var: true } : {}),
      ...(step.env_var_name !== undefined ? { env_var_name: step.env_var_name } : {})
    })) as RecordedStep[];

    const artifact: RecordingArtifact = {
      ...existing,
      steps: artifactSteps,
      actor_summary: { human: humanSteps, agent: agentSteps },
      pages_covered: pagesCovered,
      pre_conditions: finalizedData?.pre_conditions ?? existing.pre_conditions,
      post_conditions: finalizedData?.post_conditions ?? existing.post_conditions,
      depends_on: finalizedData?.depends_on ?? existing.depends_on,
      summary: finalizedData?.summary ?? existing.summary ?? ""
    };

    await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf-8");

    const screenshotDir = resolveProjectPath(recordingsDir, safeName);
    const thumbCandidatePath = path.join(screenshotDir, "step-001.png");
    let thumbnail_path: string | undefined;
    try {
      await fs.access(thumbCandidatePath);
      thumbnail_path = thumbCandidatePath;
    } catch {
      /* no first screenshot */
    }

    const indexPath = toVindicateRelativePath(artifactPath, projectRoot);

    await RecordingsIndexService.upsert(projectRoot, {
      name: existing.name,
      safe_name: safeName,
      path: indexPath,
      summary: artifact.summary ?? "",
      pre_conditions: artifact.pre_conditions ?? [],
      post_conditions: artifact.post_conditions ?? [],
      depends_on: artifact.depends_on ?? [],
      pages_covered: artifact.pages_covered ?? [],
      started_by: existing.started_by ?? "human",
      recorded_at: existing.recorded_at,
      step_count: artifactSteps.length,
      status: "finalized",
      ...(thumbnail_path !== undefined ? { thumbnail_path } : {})
    });

    this.eventBus.publish({
      event: "recording_finalized",
      session_id: existing.session_id,
      name: existing.name,
      safe_name: safeName,
      path: indexPath
    });

    this.logger.info({ safeName, artifactPath }, "[recording] refinalized artifact");
    return { path: indexPath, name: existing.name, safe_name: safeName };
  }

  async annotateArtifact(
    projectRoot: string,
    safeName: string,
    fields: {
      pre_conditions: string[];
      post_conditions: string[];
      depends_on: string[];
      summary: string;
    }
  ): Promise<void> {
    const recordingsDir = path.join(projectRoot, ".vindicate", "recordings");
    const artifactPath = resolveProjectPath(recordingsDir, `${safeName}.json`);
    const raw = await fs.readFile(artifactPath, "utf-8");
    const existing = JSON.parse(raw) as RecordingArtifact;
    const updated: RecordingArtifact = {
      ...existing,
      pre_conditions: fields.pre_conditions,
      post_conditions: fields.post_conditions,
      depends_on: fields.depends_on,
      summary: fields.summary
    };
    await fs.writeFile(artifactPath, JSON.stringify(updated, null, 2), "utf-8");

    const entry = await RecordingsIndexService.get(projectRoot, safeName);
    if (entry !== undefined) {
      await RecordingsIndexService.upsert(projectRoot, {
        ...entry,
        pre_conditions: fields.pre_conditions,
        post_conditions: fields.post_conditions,
        depends_on: fields.depends_on,
        summary: fields.summary
      });
    } else {
      this.logger.warn(
        { projectRoot, safeName },
        "[recording] index entry missing during annotate — reconstructing"
      );
      const screenshotDir = resolveProjectPath(recordingsDir, safeName);
      const thumbCandidatePath = path.join(screenshotDir, "step-001.png");
      let thumbnail_path: string | undefined;
      try {
        await fs.access(thumbCandidatePath);
        thumbnail_path = thumbCandidatePath;
      } catch {
        /* no first screenshot */
      }
      await RecordingsIndexService.upsert(projectRoot, {
        name: existing.name,
        safe_name: safeName,
        path: toVindicateRelativePath(artifactPath, projectRoot),
        summary: fields.summary,
        pre_conditions: fields.pre_conditions,
        post_conditions: fields.post_conditions,
        depends_on: fields.depends_on,
        pages_covered: existing.pages_covered ?? [],
        started_by: existing.started_by ?? "human",
        recorded_at: existing.recorded_at,
        step_count: existing.steps.length,
        status: "finalized",
        ...(thumbnail_path !== undefined ? { thumbnail_path } : {})
      });
    }
  }

  getRecordingStateResponse(sessionId: string):
    | { status: "none"; steps: []; name: ""; sessionId: string }
    | {
        status: "recording" | "review" | "finalized";
        steps: RecordingStep[];
        name: string;
        sessionId: string;
      } {
    const state = this.store.get(sessionId);
    if (state === undefined) {
      return { status: "none", steps: [], name: "", sessionId };
    }
    return {
      status: state.status,
      steps: state.steps,
      name: state.name,
      sessionId
    };
  }

  getState(sessionId: string): RecordingSessionState | undefined {
    return this.store.get(sessionId);
  }

  markReviewOnContextDead(sessionId: string): void {
    const state = this.store.get(sessionId);
    if (state === undefined || state.status !== "recording") {
      return;
    }
    const stopped = this.store.stop(sessionId);
    if (!stopped) {
      return;
    }
    this.eventBus.publish({ event: "recording_stopped", session_id: sessionId });
    this.logger.info({ sessionId }, "[recording] context dead — moved to review");
  }

  private shouldSkipPreNavSnapshotInsert(state: RecordingSessionState, preNavUrl: string): boolean {
    const prev = state.steps[state.steps.length - 1];
    return prev?.action === "snapshot" && prev.url === preNavUrl;
  }

  private classifyNavigationTriggerForFrameNav(
    state: RecordingSessionState,
    nowMs: number,
    newUrl: string
  ): "explicit" | "implicit" {
    const pending = state.pendingNavigationTrigger;
    if (pending !== undefined) {
      const isFresh = nowMs - pending.timestampMs <= IMPLICIT_NAV_TRIGGER_WINDOW_MS;
      const changedUrl = pending.urlBefore === undefined || pending.urlBefore !== newUrl;
      if (isFresh && changedUrl) {
        return "implicit";
      }
      if (!isFresh) {
        delete state.pendingNavigationTrigger;
      }
    }
    return classifyNavigation(state.steps, nowMs);
  }

  private insertBufferedPreNavSnapshot(
    sessionId: string,
    state: RecordingSessionState,
    preNavUrl: string
  ): void {
    const buffered = state.lastPageSnapshot;
    if (buffered === undefined || buffered.url !== preNavUrl) {
      return;
    }

    const seq = this.store.addStep(sessionId, {
      action: "snapshot",
      timestamp: new Date().toISOString(),
      url: preNavUrl,
      candidates: [],
      chosen: null,
      actor: state.started_by === "agent" ? "agent" : "human"
    });
    if (seq < 0) {
      return;
    }
    this.store.updateStepPageSnapshot(sessionId, seq, buffered.snapshot);

    delete state.lastPageSnapshot;
    const step = state.steps[seq - 1];
    if (step === undefined) {
      return;
    }

    this.eventBus.publish({
      event: "recording_step",
      session_id: sessionId,
      step: { ...step }
    });
  }

  private async refreshPageSnapshotBuffer(
    sessionId: string,
    state: RecordingSessionState,
    page: Awaited<ReturnType<IBrowserBridge["getPage"]>>,
    maxElements: number
  ): Promise<void> {
    try {
      const pageSnapshot = await this.capturePageSnapshot(page, state, maxElements);
      if (pageSnapshot === undefined) {
        return;
      }
      const url = page.url();
      state.lastPageSnapshot = { url, snapshot: pageSnapshot };
    } catch (err: unknown) {
      this.logger.warn({ err, sessionId }, "[recording] page snapshot buffer refresh failed");
    }
  }

  private mergeEditedSteps(existing: RecordingStep[], edited: RecordingStep[]): RecordingStep[] {
    const bySeq = new Map(existing.map((step) => [step.seq, step]));
    return edited.map((step, index) => {
      const prior = bySeq.get(step.seq) ?? existing[index];
      const screenshot_after = step.screenshot_after ?? prior?.screenshot_after;
      const page_snapshot = step.page_snapshot ?? prior?.page_snapshot;
      const merged: RecordingStep = {
        ...prior,
        ...step,
        seq: index + 1
      };
      if (screenshot_after !== undefined) {
        merged.screenshot_after = screenshot_after;
      } else {
        delete merged.screenshot_after;
      }
      if (page_snapshot !== undefined) {
        merged.page_snapshot = page_snapshot;
      } else {
        delete merged.page_snapshot;
      }
      return merged;
    });
  }

  private async capturePageSnapshot(
    page: Awaited<ReturnType<IBrowserBridge["getPage"]>>,
    state: RecordingSessionState,
    maxElements = 150
  ): Promise<RecordingPageSnapshot | undefined> {
    try {
      const testidCandidates = buildTestidCandidates(state.testidAttr);
      return await page.evaluate(captureRecordingPageSnapshot, {
        testidCandidates,
        maxElements,
        recorderHostId: RECORDER_HOST_ID
      });
    } catch (err: unknown) {
      this.logger.warn(
        { err, sessionId: state.sessionId },
        "[recording] page snapshot failed — continuing"
      );
      return undefined;
    }
  }
}

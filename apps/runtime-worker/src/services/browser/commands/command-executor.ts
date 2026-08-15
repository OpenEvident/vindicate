/**
 * @file Dispatches command steps — interactions, snapshot, settle, and action_result SSE payloads.
 */
import type { Frame, Page } from "playwright-core";

import type { Config } from "../../../core/config.js";
import type { IEventBus } from "../../../core/events/event-bus.interface.js";
import type { IResourceGovernor } from "../../../core/governor/resource-governor.interface.js";
import type { IBrowserBridge } from "../../../infrastructure/browser/browser-bridge.interface.js";
import {
  ActionTimeoutError,
  NavigationFailedError,
  ValidationError,
  WorkerError,
  WorkerThrottledError
} from "../../../shared/errors/worker.errors.js";
import type { SessionActionLog } from "../logs/action-log.js";
import type { ActionLogAppendInput } from "../logs/action-log.types.js";
import type { SessionLogRegistry } from "../logs/session-log-registry.js";
import type { ISessionStore } from "../session/session.store.interface.js";
import type { ActionResultPayload } from "../snapshot/action-result.js";
import { buildActionResult } from "../snapshot/action-result.js";
import {
  CheckStepSchema,
  ClickStepSchema,
  DblclickStepSchema,
  DragStepSchema,
  FillStepSchema,
  HoverStepSchema,
  NavigateStepSchema,
  PressKeyStepSchema,
  ScreenshotStepSchema,
  ScrollByStepSchema,
  SelectOptionStepSchema,
  TypeStepSchema,
  UncheckStepSchema,
  UploadFileStepSchema,
  WaitForLoadStateStepSchema,
  WaitForResponseStepSchema
} from "../interactions/interaction.params.js";
import {
  handleCheck,
  handleClick,
  handleDblclick,
  handleDrag,
  handleFill,
  handleHover,
  handleNavigate,
  handlePressKey,
  handleScreenshot,
  handleScrollBy,
  handleSelectOption,
  handleType,
  handleUncheck,
  handleUploadFile,
  handleWaitForLoadState,
  handleWaitForResponse
} from "../interactions/interaction.handlers.js";
import {
  ClearCookiesStepSchema,
  ClearStorageStepSchema,
  GetCookiesStepSchema,
  GetStorageStepSchema,
  PauseForHumanStepSchema,
  SetCookiesStepSchema,
  SetStorageStepSchema
} from "../interactions/storage.params.js";
import {
  handleClearCookies,
  handleClearStorage,
  handleGetCookies,
  handleGetStorage,
  handlePauseForHuman,
  handleSetCookies,
  handleSetStorage
} from "../interactions/storage.handlers.js";
import { EXPLORE_STYLE, type HighlightService } from "../highlight/highlight-service.js";
import type { SnapshotEngine } from "../snapshot/snapshot-engine.js";
import { SnapshotParamsSchema } from "../snapshot/snapshot.params.js";
import type { SnapshotResultWire } from "../snapshot/snapshot.types.js";
import { runSettle } from "../snapshot/settle-detector.js";
import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import type { RecordingService } from "../recording/recording.service.js";
import { buildAgentStepPayload } from "../recording/agent-step-builder.js";
import { extractTimeoutReason } from "./timeout-reason.js";
import {
  CloseTabStepSchema,
  HandleDialogStepSchema,
  NewTabStepSchema,
  SwitchTabByUrlStepSchema,
  SwitchTabStepSchema
} from "../interactions/tab.params.js";
import {
  handleCloseTab,
  handleHandleDialog,
  handleNewTab,
  handleSwitchTab,
  handleSwitchTabByUrl
} from "../interactions/tab.handlers.js";

/** Actions that run post-action settle (navigate excluded — it already waits via `wait_for`). */
const SETTLE_AFTER_ACTIONS = new Set([
  "click",
  "type",
  "fill",
  "dblclick",
  "drag",
  "select_option",
  "hover",
  "check",
  "uncheck",
  "press_key",
  "scroll_by",
  "upload_file",
  "set_cookies",
  "set_storage",
  "clear_storage",
  "clear_cookies"
]);

function filterDescriptorsByScope(
  descriptors: Map<string, ElementDescriptor>,
  scope: string | undefined
): Map<string, ElementDescriptor> {
  if (scope === undefined) {
    return descriptors;
  }
  const needle = scope.trim().toLowerCase();
  if (needle.length === 0) {
    return descriptors;
  }
  if (needle.startsWith("ref-")) {
    const hit = descriptors.get(needle);
    return hit === undefined
      ? new Map<string, ElementDescriptor>()
      : new Map<string, ElementDescriptor>([[needle, hit]]);
  }

  return new Map<string, ElementDescriptor>(
    [...descriptors.entries()].filter(([, descriptor]) => {
      const haystacks = [
        descriptor.context,
        descriptor.role,
        descriptor.name,
        descriptor.tag,
        descriptor.testid,
        descriptor.placeholder
      ];
      return haystacks.some((value) => value !== undefined && value.toLowerCase().includes(needle));
    })
  );
}

export interface CommandStepInput {
  readonly action: string;
  readonly [key: string]: unknown;
}

export interface ExecuteCommandsResult {
  readonly stepResults: unknown[];
  readonly streamFailed: boolean;
  readonly failedStep?: number;
  readonly failedAction?: string;
}

export interface CommandExecutorDeps {
  readonly bridge: IBrowserBridge;
  readonly snapshotEngine: SnapshotEngine;
  readonly highlightService: HighlightService;
  readonly store: ISessionStore;
  readonly eventBus: IEventBus;
  readonly governor: IResourceGovernor;
  readonly sessionLogs: SessionLogRegistry;
  readonly actionLog: SessionActionLog;
  readonly recordingService?: RecordingService;
  readonly config: Pick<
    Config,
    | "VINDICATE_SETTLE_NETWORK_MS"
    | "VINDICATE_SETTLE_TIMEOUT_MS"
    | "VINDICATE_ACTION_TIMEOUT_MS"
    | "VINDICATE_ACTION_TIMEOUT_MAX_MS"
  >;
}

function stepRecord(step: CommandStepInput): Record<string, unknown> {
  return { ...step };
}

function stepParamsForLog(step: CommandStepInput): Record<string, unknown> {
  const record = stepRecord(step);
  delete record.action;
  return record;
}

function snapshotIdFromResult(result: unknown): number | undefined {
  if (result === null || typeof result !== "object" || !("snapshot_id" in result)) {
    return undefined;
  }
  const id: unknown = Reflect.get(result, "snapshot_id");
  return typeof id === "number" ? id : undefined;
}

function actionLogSnapshotFields(
  before: number,
  after: number
): Pick<ActionLogAppendInput, "snapshot_id_before" | "snapshot_id_after"> {
  return {
    ...(before > 0 ? { snapshot_id_before: before } : {}),
    ...(after > 0 ? { snapshot_id_after: after } : {})
  };
}

async function emitSettleActionResult(
  page: Page,
  urlBefore: string,
  urlTrail: readonly string[] | undefined,
  config: Pick<
    CommandExecutorDeps["config"],
    "VINDICATE_SETTLE_NETWORK_MS" | "VINDICATE_SETTLE_TIMEOUT_MS"
  >,
  emit: (payload: ActionResultPayload) => void
): Promise<ActionResultPayload> {
  const settle = await runSettle(page, {
    VINDICATE_SETTLE_NETWORK_MS: config.VINDICATE_SETTLE_NETWORK_MS,
    VINDICATE_SETTLE_TIMEOUT_MS: config.VINDICATE_SETTLE_TIMEOUT_MS
  });
  const payload = buildActionResult({
    urlBefore,
    urlAfter: page.url(),
    ...(urlTrail !== undefined ? { urlTrail } : {}),
    timedOut: settle.timedOut
  });
  emit(payload);
  return payload;
}

function pushDistinctUrl(urlTrail: string[], url: string): void {
  if (url.length === 0 || urlTrail[urlTrail.length - 1] === url) {
    return;
  }
  urlTrail.push(url);
}

function startNavigationTrail(
  page: Page,
  urlBefore: string
): {
  collect: (urlAfter: string) => readonly string[];
  stop: () => void;
} {
  const trail: string[] = [];
  pushDistinctUrl(trail, urlBefore);
  const onFrameNavigated = (frame: Frame): void => {
    if (frame === page.mainFrame()) {
      pushDistinctUrl(trail, frame.url());
    }
  };
  page.on("framenavigated", onFrameNavigated);
  return {
    collect: (urlAfter: string) => {
      pushDistinctUrl(trail, urlAfter);
      return trail;
    },
    stop: () => {
      page.off("framenavigated", onFrameNavigated);
    }
  };
}

export async function executeCommandSteps(
  deps: CommandExecutorDeps,
  sessionId: string,
  steps: readonly CommandStepInput[],
  emit: (payload: unknown) => void
): Promise<ExecuteCommandsResult> {
  const stepResults: unknown[] = [];
  const getDescriptor = (ref: string) => deps.snapshotEngine.getDescriptor(sessionId, ref);

  for (const [index, step] of steps.entries()) {
    const governorState = deps.governor.state;
    if (governorState === "reject") {
      throw new WorkerThrottledError("Worker is in resource reject state — retry later", 2000);
    }
    if (governorState === "warning") {
      throw new WorkerThrottledError("Worker is in resource warning state — retry later", 500);
    }

    const action = step.action;
    // Per-step action timeout: the agent's `timeout_ms` wins, clamped to the configured ceiling so a
    // bad value can't hang the (serialized) session; the global default applies when unset.
    const requestedTimeoutMs = typeof step.timeout_ms === "number" ? step.timeout_ms : undefined;
    const actionTimeoutMs = Math.min(
      requestedTimeoutMs ?? deps.config.VINDICATE_ACTION_TIMEOUT_MS,
      deps.config.VINDICATE_ACTION_TIMEOUT_MAX_MS
    );
    const handlerCtx = { actionTimeoutMs, getDescriptor };
    emit({ event: "step_started", step: index, action });
    const t0 = Date.now();
    const snapshotIdBefore = deps.sessionLogs.getSnapshotId(sessionId);
    emit({ event: "step_progress", step: index, message: "executing" });

    try {
      let result: unknown;
      let page: Page | undefined;
      let urlBefore = "";
      let urlTrail: readonly string[] | undefined;
      let settleActionResult: ActionResultPayload | undefined;

      if (action === "pause_for_human") {
        const parsed = PauseForHumanStepSchema.safeParse(step);
        if (!parsed.success) {
          throw new ValidationError("Invalid pause_for_human step");
        }
        result = handlePauseForHuman(parsed.data);
        await deps.store.applyTrigger(sessionId, "pause");
        deps.eventBus.publish({
          event: "session_paused",
          session_id: sessionId,
          message: parsed.data.message
        });
      } else {
        page = await deps.bridge.getPage(sessionId);
        urlBefore = page.url();
        const navigationTrail = SETTLE_AFTER_ACTIONS.has(action)
          ? startNavigationTrail(page, urlBefore)
          : undefined;

        try {
          switch (action) {
            case "navigate": {
              const parsed = NavigateStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid navigate step — requires url");
              }
              result = await handleNavigate(page, parsed.data, actionTimeoutMs, {
                VINDICATE_SETTLE_NETWORK_MS: deps.config.VINDICATE_SETTLE_NETWORK_MS,
                VINDICATE_SETTLE_TIMEOUT_MS: deps.config.VINDICATE_SETTLE_TIMEOUT_MS
              });
              deps.snapshotEngine.onNavigation(sessionId);
              break;
            }
            case "snapshot": {
              const rest = stepRecord(step);
              delete rest.action;
              const snapParsed = SnapshotParamsSchema.safeParse(rest);
              if (!snapParsed.success) {
                throw new ValidationError("Invalid snapshot step params");
              }
              result = await deps.snapshotEngine.takeSnapshot(sessionId, page, snapParsed.data);

              const session = deps.store.get(sessionId);
              if (
                step.highlight === true &&
                page !== undefined &&
                session !== undefined &&
                !session.headless
              ) {
                const highlightPage = page;
                const snap = result as SnapshotResultWire;
                const viewportDescriptors = (snap.elements ?? [])
                  .filter((el) => el.in_viewport && !el.disabled)
                  .map((el) => deps.snapshotEngine.getDescriptor(sessionId, el.ref))
                  .filter((d): d is NonNullable<typeof d> => d !== undefined);

                void deps.highlightService
                  .clearHighlights(highlightPage, sessionId)
                  .then(() =>
                    deps.highlightService.highlightRefs(
                      highlightPage,
                      sessionId,
                      viewportDescriptors,
                      EXPLORE_STYLE
                    )
                  )
                  .catch(() => {});
              }
              break;
            }
            case "screenshot": {
              const parsed = ScreenshotStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid screenshot step");
              }
              result = await handleScreenshot(page, parsed.data, handlerCtx);
              break;
            }
            case "click": {
              const parsed = ClickStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid click step");
              }
              result = await handleClick(page, parsed.data, handlerCtx);
              break;
            }
            case "type": {
              const parsed = TypeStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid type step");
              }
              result = await handleType(page, parsed.data, handlerCtx);
              break;
            }
            case "fill": {
              const parsed = FillStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid fill step");
              }
              result = await handleFill(page, parsed.data, handlerCtx);
              break;
            }
            case "dblclick": {
              const parsed = DblclickStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid dblclick step");
              }
              result = await handleDblclick(page, parsed.data, handlerCtx);
              break;
            }
            case "drag": {
              const parsed = DragStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid drag step — requires ref and to_ref");
              }
              result = await handleDrag(page, parsed.data, handlerCtx);
              break;
            }
            case "select_option": {
              const parsed = SelectOptionStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError(
                  "Invalid select_option step — requires value, label, or index"
                );
              }
              result = await handleSelectOption(page, parsed.data, handlerCtx);
              break;
            }
            case "hover": {
              const parsed = HoverStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid hover step");
              }
              result = await handleHover(page, parsed.data, handlerCtx);
              break;
            }
            case "check": {
              const parsed = CheckStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid check step");
              }
              result = await handleCheck(page, parsed.data, handlerCtx);
              break;
            }
            case "uncheck": {
              const parsed = UncheckStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid uncheck step");
              }
              result = await handleUncheck(page, parsed.data, handlerCtx);
              break;
            }
            case "press_key": {
              const parsed = PressKeyStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid press_key step");
              }
              result = await handlePressKey(page, parsed.data, handlerCtx);
              break;
            }
            case "scroll_by": {
              const parsed = ScrollByStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid scroll_by step");
              }
              result = await handleScrollBy(page, parsed.data, handlerCtx);
              break;
            }
            case "upload_file": {
              const parsed = UploadFileStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError(
                  "Invalid upload_file step — requires ref and files (absolute paths on the worker)"
                );
              }
              result = await handleUploadFile(page, parsed.data, handlerCtx);
              break;
            }
            case "resolve_target": {
              const target = step.target;
              if (typeof target !== "string" || target.length === 0) {
                throw new ValidationError(
                  "resolve_target requires a non-empty target string — describe the element in natural language"
                );
              }
              const descriptors = deps.snapshotEngine.getAllDescriptors(sessionId);
              if (descriptors.size === 0) {
                throw new ValidationError(
                  "No snapshot descriptors for this session — run action snapshot or browser_read first"
                );
              }
              const scope = typeof step.scope === "string" ? step.scope : undefined;
              const scopedDescriptors = filterDescriptorsByScope(descriptors, scope);
              const { resolveByTarget } = await import("../interactions/intent-resolver.js");
              result = resolveByTarget(target, scopedDescriptors);
              break;
            }
            case "assert": {
              const snap = await deps.snapshotEngine.takeSnapshot(sessionId, page, {
                mode: "interactive"
              });
              const alerts = snap.alerts ?? [];
              let passed: boolean | undefined;
              let failReason: string | undefined;
              if (typeof step.expect === "string") {
                const allText = [...alerts, ...(snap.elements ?? []).map((e) => e.name)]
                  .join(" ")
                  .toLowerCase();
                passed = allText.includes(step.expect.toLowerCase());
                if (!passed) {
                  failReason = `Expected "${step.expect}" not found in page content or alerts — call browser_read to inspect current state`;
                }
              }
              let extracted: Record<string, unknown> | undefined;
              if (
                step.extract !== undefined &&
                step.extract !== null &&
                typeof step.extract === "object"
              ) {
                extracted = {};
                const elements = snap.elements ?? [];
                for (const [key] of Object.entries(step.extract as Record<string, string>)) {
                  const needle = key.toLowerCase().replace(/_/g, " ");
                  const match = elements.find((e) => e.name.toLowerCase().includes(needle)) ?? null;
                  extracted[key] = match?.value ?? match?.name ?? null;
                }
              }
              result = {
                ...(passed !== undefined
                  ? { passed, ...(failReason !== undefined ? { fail_reason: failReason } : {}) }
                  : {}),
                alerts,
                ...(extracted !== undefined ? { extracted } : {})
              };
              break;
            }
            case "get_cookies": {
              const parsed = GetCookiesStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid get_cookies step");
              }
              result = await handleGetCookies(page, parsed.data);
              break;
            }
            case "set_cookies": {
              const parsed = SetCookiesStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid set_cookies step");
              }
              result = await handleSetCookies(page, parsed.data);
              break;
            }
            case "clear_cookies": {
              const parsed = ClearCookiesStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid clear_cookies step");
              }
              result = await handleClearCookies(page, parsed.data);
              break;
            }
            case "get_storage": {
              const parsed = GetStorageStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid get_storage step");
              }
              result = await handleGetStorage(page, parsed.data);
              break;
            }
            case "set_storage": {
              const parsed = SetStorageStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid set_storage step");
              }
              result = await handleSetStorage(page, parsed.data);
              break;
            }
            case "clear_storage": {
              const parsed = ClearStorageStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid clear_storage step");
              }
              result = await handleClearStorage(page, parsed.data);
              break;
            }
            case "new_tab": {
              const parsed = NewTabStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid new_tab step");
              }
              const tabState = deps.bridge.getTabState(sessionId);
              result = await handleNewTab(
                deps.bridge.getContext(sessionId),
                tabState,
                parsed.data,
                deps.config.VINDICATE_ACTION_TIMEOUT_MS
              );
              break;
            }
            case "switch_tab": {
              const parsed = SwitchTabStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid switch_tab step — requires index");
              }
              const tabState = deps.bridge.getTabState(sessionId);
              result = await handleSwitchTab(
                deps.bridge.getContext(sessionId),
                tabState,
                parsed.data
              );
              break;
            }
            case "switch_tab_by_url": {
              const parsed = SwitchTabByUrlStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError(
                  "Invalid switch_tab_by_url step — requires url_pattern matching part of an open tab URL"
                );
              }
              const tabState = deps.bridge.getTabState(sessionId);
              result = await handleSwitchTabByUrl(
                deps.bridge.getContext(sessionId),
                tabState,
                parsed.data.url_pattern
              );
              break;
            }
            case "wait_for_load_state": {
              const parsed = WaitForLoadStateStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid wait_for_load_state step");
              }
              result = await handleWaitForLoadState(
                page,
                parsed.data,
                deps.config.VINDICATE_ACTION_TIMEOUT_MS
              );
              break;
            }
            case "wait_for_response": {
              const parsed = WaitForResponseStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid wait_for_response step");
              }
              result = await handleWaitForResponse(
                page,
                parsed.data,
                deps.config.VINDICATE_ACTION_TIMEOUT_MS
              );
              break;
            }
            case "close_tab": {
              const parsed = CloseTabStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid close_tab step");
              }
              const tabState = deps.bridge.getTabState(sessionId);
              result = await handleCloseTab(
                deps.bridge.getContext(sessionId),
                tabState,
                parsed.data
              );
              break;
            }
            case "handle_dialog": {
              const parsed = HandleDialogStepSchema.safeParse(step);
              if (!parsed.success) {
                throw new ValidationError("Invalid handle_dialog step");
              }
              const tabState = deps.bridge.getTabState(sessionId);
              result = await handleHandleDialog(
                deps.bridge.getContext(sessionId),
                tabState,
                parsed.data,
                deps.config.VINDICATE_ACTION_TIMEOUT_MS
              );
              break;
            }
            default:
              throw new ValidationError(`Unsupported action: ${action}`);
          }
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            (err.constructor.name === "TimeoutError" || err.message.includes("Timeout"))
          ) {
            throw new ActionTimeoutError(
              action,
              actionTimeoutMs,
              extractTimeoutReason(err.message)
            );
          }
          if (err instanceof Error && err.message.includes("strict mode violation")) {
            throw new ValidationError(
              `'${action}' matched multiple elements — use a testid or scoped snapshot to disambiguate`
            );
          }
          throw err;
        } finally {
          if (navigationTrail !== undefined) {
            urlTrail = navigationTrail.collect(page.url());
            navigationTrail.stop();
          }
        }
      }

      if (page !== undefined && SETTLE_AFTER_ACTIONS.has(action)) {
        settleActionResult = await emitSettleActionResult(
          page,
          urlBefore,
          urlTrail,
          deps.config,
          (payload) => {
            emit(payload);
          }
        );
      }

      const recordingState = deps.recordingService?.getState(sessionId);
      if (recordingState?.status === "recording" && deps.recordingService !== undefined) {
        const agentPayload = buildAgentStepPayload(
          step,
          (ref) => deps.snapshotEngine.getDescriptor(sessionId, ref),
          result
        );
        if (agentPayload !== undefined) {
          await deps.recordingService.addAgentStep(sessionId, agentPayload);
          const urlAfter = page?.url() ?? "";
          if (
            recordingState.started_by === "agent" &&
            action !== "navigate" &&
            urlBefore.length > 0 &&
            urlAfter.length > 0 &&
            urlAfter !== urlBefore
          ) {
            await deps.recordingService.addAgentImplicitNavigate(sessionId, urlAfter);
          }
        }
      }

      const snapshotFromResult = snapshotIdFromResult(result);
      const snapshotIdAfter = snapshotFromResult ?? deps.sessionLogs.getSnapshotId(sessionId);

      deps.actionLog.append(sessionId, {
        action,
        params: stepParamsForLog(step),
        result: "success",
        duration_ms: Date.now() - t0,
        ...actionLogSnapshotFields(snapshotIdBefore, snapshotIdAfter)
      });

      if (action === "snapshot") {
        stepResults.push({ action: "snapshot", ...(result as Record<string, unknown>) });
      } else {
        const stepResult: Record<string, unknown> = {
          action,
          ...(result as Record<string, unknown>)
        };
        if (
          settleActionResult !== undefined &&
          action === "click" &&
          (settleActionResult.url_trail?.length ?? 0) > 1
        ) {
          Object.assign(stepResult, {
            page_change: settleActionResult.page_change,
            recommendation: settleActionResult.recommendation,
            ...(settleActionResult.url_before !== undefined
              ? { url_before: settleActionResult.url_before }
              : {}),
            ...(settleActionResult.url_after !== undefined
              ? { url_after: settleActionResult.url_after }
              : {}),
            ...(settleActionResult.url_trail !== undefined
              ? { url_trail: settleActionResult.url_trail }
              : {}),
            ...(settleActionResult.hint !== undefined ? { hint: settleActionResult.hint } : {}),
            ...(settleActionResult.settle_timed_out !== undefined
              ? { settle_timed_out: settleActionResult.settle_timed_out }
              : {})
          });
        }
        stepResults.push(stepResult);
      }
    } catch (err: unknown) {
      if (err instanceof WorkerError) {
        deps.actionLog.append(sessionId, {
          action,
          params: stepParamsForLog(step),
          result: "failure",
          duration_ms: Date.now() - t0,
          error_code: err.code,
          ...actionLogSnapshotFields(snapshotIdBefore, deps.sessionLogs.getSnapshotId(sessionId))
        });
        const failedPayload: Record<string, unknown> = {
          event: "failed",
          step: index,
          action,
          error: err.message,
          code: err.code
        };
        if (err instanceof NavigationFailedError && err.status !== undefined) {
          failedPayload.status = err.status;
        }
        emit(failedPayload);
        return { stepResults, streamFailed: true, failedStep: index, failedAction: action };
      }
      throw err;
    }

    emit({
      event: "step_completed",
      step: index,
      duration_ms: Date.now() - t0
    });
  }

  return { stepResults, streamFailed: false };
}

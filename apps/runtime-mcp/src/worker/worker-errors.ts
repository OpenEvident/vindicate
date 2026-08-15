/**
 * @file Maps worker HTTP error payloads to MCP domain errors.
 */
import { logger } from "../core/logger.js";
import {
  ActionTimeoutError,
  ApiRequestFailedError,
  BrowserCrashError,
  ElementNotFoundError,
  FileOutsideRootError,
  FileTooLargeError,
  NavigationFailedError,
  SessionBusyError,
  SessionDeadError,
  SessionNotFoundError,
  SessionPausedError,
  SessionUnresumableError,
  StateDriftError,
  WorkerUnavailableError,
  WorkerValidationError
} from "../shared/errors.js";

interface WorkerErrorBody {
  readonly ok?: boolean;
  readonly error?: string;
  readonly code?: string;
  readonly retry_after_ms?: number;
}

export async function throwFromWorkerResponse(res: Response, sessionId?: string): Promise<never> {
  let body: WorkerErrorBody = {};
  try {
    body = (await res.json()) as WorkerErrorBody;
  } catch {
    /* ignore */
  }
  const code = body.code ?? "worker.internal";
  logger.warn(
    { status: res.status, code, error: body.error ?? null, url: res.url },
    "[worker] error response"
  );
  const sid = sessionId ?? "unknown";

  switch (code) {
    case "session.not_found":
      throw new SessionNotFoundError(sid);
    case "session.dead":
      throw new SessionDeadError(sid);
    case "session.busy":
      throw new SessionBusyError(sid);
    case "session.paused":
      throw new SessionPausedError(sid);
    case "session.unresumable":
      throw new SessionUnresumableError(sid, body.error ?? "session cannot be resumed");
    case "session.invalid_transition":
      throw new WorkerValidationError(
        body.error ?? "Session is in an unexpected state for this operation"
      );
    case "auth.key_invalid":
      throw new WorkerUnavailableError(
        "Worker rejected the internal key — restart the runtime worker and MCP with a matching VINDICATE_INTERNAL_KEY."
      );
    case "browser.element_not_found":
      throw new ElementNotFoundError(undefined, body.error);
    case "browser.not_implemented":
      throw new WorkerValidationError(
        body.error ?? "This action is not supported by the current worker"
      );
    case "browser.element_stale":
    case "browser.state_drift":
      throw new StateDriftError(body.error);
    case "browser.navigation_failed":
      throw new NavigationFailedError(body.error ?? "Navigation failed");
    case "browser.action_timeout":
      throw new ActionTimeoutError(body.error ?? "Action timed out");
    case "browser.crash":
      throw new BrowserCrashError(body.error ?? "Browser crashed");
    case "browser.unavailable":
    case "worker.throttled":
      throw new WorkerUnavailableError(
        typeof body.retry_after_ms === "number"
          ? `${body.error ?? "Worker unavailable"} Retry after ${body.retry_after_ms}ms.`
          : body.error
      );
    case "files.outside_root":
      throw new FileOutsideRootError(body.error ?? "unknown");
    case "files.too_large":
      throw new FileTooLargeError(0);
    case "validation.invalid_params":
      throw new WorkerValidationError(body.error ?? "Invalid request parameters");
    case "api.request_failed":
      // Distinct from the 502/503 branch below: this means the *target* API the agent tried to
      // reach didn't respond — the Vindicate worker itself is fine. Must never be mapped to
      // WorkerUnavailableError, which tells the agent to stop calling Vindicate tools entirely.
      throw new ApiRequestFailedError(body.error ?? "The target API did not respond");
    default:
      if (res.status === 503 || res.status === 502 || res.status === 0) {
        throw new WorkerUnavailableError(body.error);
      }
      throw new Error(body.error ?? `Worker request failed (${res.status})`);
  }
}

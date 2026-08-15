/**
 * @file Typed domain errors for the runtime worker. Mapped by {@link registerErrorHandler}.
 */
export abstract class WorkerError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  override readonly name = this.constructor.name;
}

/** Session lifecycle */
export class SessionNotFoundError extends WorkerError {
  readonly code = "session.not_found";
  readonly httpStatus = 404;

  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}

export class SessionDeadError extends WorkerError {
  readonly code = "session.dead";
  readonly httpStatus = 410;

  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is dead`);
  }
}

export class SessionBusyError extends WorkerError {
  readonly code = "session.busy";
  readonly httpStatus = 409;

  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is busy processing another command`);
  }
}

export class SessionUnresumableError extends WorkerError {
  readonly code = "session.unresumable";
  readonly httpStatus = 410;

  constructor(
    readonly sessionId: string,
    reason: string
  ) {
    super(`Session ${sessionId} cannot be resumed: ${reason}`);
  }
}

export class SessionPausedError extends WorkerError {
  readonly code = "session.paused";
  readonly httpStatus = 409;

  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is paused for human input`);
  }
}

export class InvalidTransitionError extends WorkerError {
  readonly code = "session.invalid_transition";
  readonly httpStatus = 400;

  constructor(
    readonly from: string,
    readonly trigger: string
  ) {
    super(`Invalid session transition from "${from}" on trigger "${trigger}"`);
  }
}

/** DOM / element */
export class ElementNotFoundError extends WorkerError {
  readonly code = "browser.element_not_found";
  readonly httpStatus = 404;

  constructor(
    readonly ref: string,
    detail?: string
  ) {
    const base = `Element '${ref}' not found`;
    super(detail !== undefined ? `${base} — ${detail}` : `${base} — call browser_read and retry`);
  }
}

/** Browser actions */
export class NavigationFailedError extends WorkerError {
  readonly code = "browser.navigation_failed";
  readonly httpStatus = 422;

  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export class ActionTimeoutError extends WorkerError {
  readonly code = "browser.action_timeout";
  readonly httpStatus = 408;

  constructor(action: string, limitMs: number, reason?: string) {
    const base = `Action "${action}" timed out after ${limitMs}ms`;
    super(reason !== undefined && reason.length > 0 ? `${base} — still waiting: ${reason}` : base);
  }
}

export class ActionNotImplementedError extends WorkerError {
  readonly code = "browser.not_implemented";
  readonly httpStatus = 501;

  constructor(readonly action: string) {
    super(`Action "${action}" is not implemented in this worker phase`);
  }
}

export class BrowserCrashError extends WorkerError {
  readonly code = "browser.crash";
  readonly httpStatus = 503;

  constructor(reason: string) {
    super(`Browser crashed: ${reason}`);
  }
}

export class BrowserUnavailableError extends WorkerError {
  readonly code = "browser.unavailable";
  readonly httpStatus = 503;

  constructor(reason: string) {
    super(reason);
  }
}

export class StateDriftError extends WorkerError {
  readonly code = "browser.state_drift";
  readonly httpStatus = 422;

  constructor(ref: string, snapshotId: number, currentId: number) {
    super(
      `Ref "${ref}" is from snapshot ${snapshotId}, current is ${currentId} — take a new snapshot`
    );
  }
}

/** Files */
export class FilesOutsideRootError extends WorkerError {
  readonly code = "files.outside_root";
  readonly httpStatus = 403;

  constructor(readonly attemptedPath: string) {
    super(`Path escapes project root: ${attemptedPath}`);
  }
}

export class FilesTooLargeError extends WorkerError {
  readonly code = "files.too_large";
  readonly httpStatus = 413;

  constructor(readonly maxBytes: number) {
    super(`File exceeds maximum size of ${maxBytes} bytes`);
  }
}

/** Worker-wide */
export class WorkerThrottledError extends WorkerError {
  readonly code = "worker.throttled";
  readonly httpStatus = 429;

  constructor(
    reason: string,
    readonly retryAfterMs?: number
  ) {
    super(`Worker throttled: ${reason}`);
  }
}

export class ValidationError extends WorkerError {
  readonly code = "validation.invalid_params";
  readonly httpStatus = 400;

  constructor(message: string) {
    super(message);
  }
}

/** api_request (fallback/gap-filler for API grounding + diagnosis) — never for a real HTTP
 * response, even 4xx/5xx: only when the request itself never reached the server (DNS failure,
 * connection refused, timeout). A real response, whatever its status, is the tool's success case. */
export class ApiRequestFailedError extends WorkerError {
  readonly code = "api.request_failed";
  readonly httpStatus = 502;

  constructor(method: string, url: string, reason: string) {
    super(`${method} ${url} failed: ${reason}`);
  }
}

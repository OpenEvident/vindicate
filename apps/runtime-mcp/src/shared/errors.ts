/**
 * @file MCP-side domain errors — mapped to tool results via {@link toMcpToolError}.
 */

export class WorkerUnavailableError extends Error {
  override readonly name = "WorkerUnavailableError";
  constructor(message = "Worker is temporarily unavailable") {
    super(message);
  }
}

export class WorkerShuttingDownError extends Error {
  override readonly name = "WorkerShuttingDownError";
  constructor(message = "Worker is shutting down") {
    super(message);
  }
}

export class SessionNotFoundError extends Error {
  override readonly name = "SessionNotFoundError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}

export class SessionDeadError extends Error {
  override readonly name = "SessionDeadError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is dead`);
  }
}

export class SessionBusyError extends Error {
  override readonly name = "SessionBusyError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is busy`);
  }
}

export class SessionPausedError extends Error {
  override readonly name = "SessionPausedError";
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is paused for human input`);
  }
}

export class SessionUnresumableError extends Error {
  override readonly name = "SessionUnresumableError";
  constructor(
    readonly sessionId: string,
    readonly reason: string
  ) {
    super(`Session ${sessionId} cannot be resumed: ${reason}`);
  }
}

export class NavigationFailedError extends Error {
  override readonly name = "NavigationFailedError";
  constructor(message: string) {
    super(message);
  }
}

export class ActionTimeoutError extends Error {
  override readonly name = "ActionTimeoutError";
  constructor(message: string) {
    super(message);
  }
}

export class ElementNotFoundError extends Error {
  override readonly name = "ElementNotFoundError";
  constructor(readonly ref?: string, detail?: string) {
    super(
      detail !== undefined && detail.length > 0
        ? detail
        : ref === undefined
          ? "Element not found"
          : `Element not found for ref ${ref}`
    );
  }
}

export class StateDriftError extends Error {
  override readonly name = "StateDriftError";
  constructor(message = "Snapshot is stale") {
    super(message);
  }
}

export class BrowserCrashError extends Error {
  override readonly name = "BrowserCrashError";
  constructor(message = "Browser crashed") {
    super(message);
  }
}

export class FileOutsideRootError extends Error {
  override readonly name = "FileOutsideRootError";
  constructor(readonly attemptedPath: string) {
    super(`Path escapes project root: ${attemptedPath}`);
  }
}

export class FileTooLargeError extends Error {
  override readonly name = "FileTooLargeError";
  constructor(readonly maxBytes: number) {
    super(`File exceeds maximum size of ${maxBytes} bytes`);
  }
}

export class FileNotFoundError extends Error {
  override readonly name = "FileNotFoundError";
  constructor(readonly relativePath: string) {
    super(`File not found: ${relativePath}`);
  }
}

export class StringNotFoundError extends Error {
  override readonly name = "StringNotFoundError";
  constructor(readonly relativePath: string) {
    super(`old_string not found in ${relativePath}`);
  }
}

export class WorkerValidationError extends Error {
  override readonly name = "WorkerValidationError";
  constructor(message: string) {
    super(message);
  }
}

/** api_request couldn't reach the target API at all (DNS/connection/timeout) — distinct from
 * WorkerUnavailableError, which means the Vindicate runtime worker itself is down. A real HTTP
 * response, even a 4xx/5xx from the target API, is never this error. */
export class ApiRequestFailedError extends Error {
  override readonly name = "ApiRequestFailedError";
  constructor(message: string) {
    super(message);
  }
}

export class CodegenValidationError extends Error {
  override readonly name = "CodegenValidationError";
  constructor(
    readonly field: string,
    readonly validationMessage: string,
    readonly fix: string
  ) {
    super(validationMessage);
  }
}

export class CodegenStructuralError extends Error {
  override readonly name = "CodegenStructuralError";
  constructor(
    readonly structuralMessage: string,
    readonly fix: string
  ) {
    super(structuralMessage);
  }
}

export class CodegenVersionError extends Error {
  override readonly name = "CodegenVersionError";
  constructor(message: string) {
    super(message);
  }
}

export class CodegenLocatorError extends Error {
  override readonly name = "CodegenLocatorError";
  constructor(message: string) {
    super(message);
  }
}

export class WorkflowContentError extends Error {
  override readonly name = "WorkflowContentError";
  constructor(message: string) {
    super(message);
  }
}

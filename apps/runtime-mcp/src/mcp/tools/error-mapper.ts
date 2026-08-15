/**
 * @file Maps domain errors to MCP tool error results — never leaks stack traces.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  ActionTimeoutError,
  ApiRequestFailedError,
  BrowserCrashError,
  CodegenLocatorError,
  CodegenStructuralError,
  CodegenValidationError,
  CodegenVersionError,
  ElementNotFoundError,
  FileNotFoundError,
  FileOutsideRootError,
  FileTooLargeError,
  StringNotFoundError,
  NavigationFailedError,
  SessionBusyError,
  SessionDeadError,
  SessionNotFoundError,
  SessionPausedError,
  SessionUnresumableError,
  StateDriftError,
  WorkerShuttingDownError,
  WorkerUnavailableError,
  WorkerValidationError,
  WorkflowContentError
} from "../../shared/errors.js";

function errorText(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

export function toMcpToolError(err: unknown): CallToolResult {
  // ── Terminal: worker process unavailable ────────────────────────────────
  if (err instanceof WorkerUnavailableError) {
    return errorText(
      "The Vindicate runtime worker is temporarily unavailable. " +
        "Do not call any further Vindicate tools. " +
        "Tell the user the worker is offline and ask them to check the Vindicate: Runtime Worker output channel."
    );
  }
  if (err instanceof WorkerShuttingDownError) {
    return errorText(
      "The Vindicate runtime worker is shutting down. " +
        "Do not call any further Vindicate tools. " +
        "Tell the user the worker is restarting and to try again in a moment."
    );
  }

  // ── Validation ──────────────────────────────────────────────────────────
  if (err instanceof WorkerValidationError) {
    return errorText(`Invalid parameters: ${err.message}`);
  }

  // ── Browser session lifecycle ───────────────────────────────────────────
  if (err instanceof SessionNotFoundError) {
    return errorText(
      `Session '${err.sessionId}' not found. Call browser_session with action:'create' first.`
    );
  }
  if (err instanceof SessionDeadError) {
    return errorText(
      `Session '${err.sessionId}' is dead (browser crashed). Call browser_session with action:'resume'.`
    );
  }
  if (err instanceof SessionPausedError) {
    return errorText(
      `Session '${err.sessionId}' is paused for human input. When the user is done, call browser_session with action:'resume_from_pause'.`
    );
  }
  if (err instanceof SessionUnresumableError) {
    return errorText(
      `Session '${err.sessionId}' cannot be resumed: ${err.reason}. ` +
        "Use browser_session action:'resume' after a crash, or action:'resume_from_pause' after a pause."
    );
  }
  if (err instanceof SessionBusyError) {
    return errorText(
      `Session '${err.sessionId}' is busy processing a previous command. ` +
        "Wait for that call to finish, then retry — one browser tool at a time per session; do not parallelize."
    );
  }

  // ── Browser navigation / interaction ───────────────────────────────────
  if (err instanceof NavigationFailedError) {
    return errorText(
      `Navigation failed: ${err.message} ` +
        "Take a snapshot to check the current page state. " +
        "If the page loaded, continue. If not, report the failure to the user and stop."
    );
  }
  if (err instanceof ActionTimeoutError) {
    return errorText(
      err.message.startsWith("Worker command")
        ? err.message
        : `Action timed out: ${err.message} ` +
            "The element may be slow to appear or covered by an overlay — call browser_diagnose to see the page, " +
            "raise timeout_ms, or call browser_read for a fresh snapshot. " +
            "If it then resolves, retry once; otherwise report to the user and stop."
    );
  }
  if (err instanceof Error && err.name === "AbortError") {
    return errorText(
      "The browser command was aborted before completing. " +
        "Take a snapshot to check the current page state before attempting any further interaction. " +
        "Do not retry the aborted action without first confirming the page state."
    );
  }
  if (err instanceof ElementNotFoundError) {
    // err.message carries the worker's specific reason (stale ref from a previous page, ambiguous ref,
    // missing descriptor, etc.). Surface it, add the re-read hint only if the message doesn't already
    // mention it, then always add the visual-fallback hint.
    const detail = err.message;
    const parts = [detail.endsWith(".") ? detail : `${detail}.`];
    if (!detail.toLowerCase().includes("browser_read")) {
      parts.push("Call browser_read for a fresh snapshot and use a valid ref.");
    }
    parts.push(
      "If the element may be covered by an overlay, call browser_diagnose to see the page."
    );
    return errorText(parts.join(" "));
  }
  if (err instanceof StateDriftError) {
    return errorText("Snapshot is stale. Call browser_read before interacting.");
  }
  if (err instanceof BrowserCrashError) {
    return errorText("Browser crashed. Call browser_session with action:'resume' to recover.");
  }

  // ── API request (fallback/gap-filler tool — never a proactive step) ────────────────────────
  if (err instanceof ApiRequestFailedError) {
    return errorText(
      `api_request could not reach the target API: ${err.message} ` +
        "This means the URL/host didn't respond (DNS, connection, or timeout) — it does not mean " +
        "the Vindicate worker is unavailable, and other Vindicate tools are unaffected. " +
        "Double-check the URL and network reachability before retrying; if it keeps failing, report it " +
        "to the user rather than guessing at the API's shape."
    );
  }

  // ── File system ─────────────────────────────────────────────────────────
  if (err instanceof FileOutsideRootError) {
    return errorText("Path is outside the project root. Use relative paths only.");
  }
  if (err instanceof FileTooLargeError) {
    return errorText(
      "File exceeds the maximum size limit. " +
        "Read a smaller portion using the offset and limit parameters instead of reading the whole file."
    );
  }
  if (err instanceof FileNotFoundError) {
    return errorText(
      `File not found: ${err.relativePath} ` + "Verify the path exists before retrying."
    );
  }
  if (err instanceof StringNotFoundError) {
    return errorText(
      `Text to replace was not found in ${err.relativePath}. ` +
        "Read the file first to get the exact current content, then retry with the correct string."
    );
  }

  // ── Codegen ─────────────────────────────────────────────────────────────────
  if (err instanceof CodegenValidationError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "schema_validation",
              field: err.field,
              message: err.validationMessage,
              fix: err.fix,
              instruction:
                "Fix this field in the schema JSON and retry the same vindicate_generate_code call. " +
                "Do not write the page/client/spec/fixture files by hand instead — codegen wires " +
                "required scaffolding (barrels, config fixtures, expected.json) atomically, and a " +
                "direct file write will not reproduce that correctly."
            },
            null,
            2
          )
        }
      ]
    };
  }
  if (err instanceof CodegenStructuralError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "structural_check",
              message: err.structuralMessage,
              fix: err.fix,
              instruction:
                "Fix this in the schema JSON and retry the same vindicate_generate_code call. " +
                "Do not write the page/client/spec/fixture files by hand instead — codegen wires " +
                "required scaffolding (barrels, config fixtures, expected.json) atomically, and a " +
                "direct file write will not reproduce that correctly."
            },
            null,
            2
          )
        }
      ]
    };
  }
  if (err instanceof CodegenVersionError) {
    return errorText(
      `Schema version mismatch: ${err.message} Do not use patch modes on this schema. ` +
        "Report this to the user — no automatic migration is available in this release."
    );
  }
  if (err instanceof CodegenLocatorError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "locator_derive",
              message: err.message,
              fix: "Add testid+testid_attr, role, or name to the element descriptor."
            },
            null,
            2
          )
        }
      ]
    };
  }

  if (err instanceof WorkflowContentError) {
    return errorText(err.message);
  }

  // ── Catch-all ───────────────────────────────────────────────────────────
  // Log so the real cause appears in the MCP server output channel.
  console.error("[toMcpToolError] Unhandled error:", err);
  return errorText(
    "An unexpected error occurred. " +
      "Do not retry this tool call with the same arguments. " +
      "Tell the user what happened, suggest they check the Vindicate output channel for the underlying cause, " +
      "and wait for their instruction."
  );
}

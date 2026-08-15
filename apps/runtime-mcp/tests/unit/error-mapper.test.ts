import { describe, expect, it, vi } from "vitest";

import {
  ApiRequestFailedError,
  BrowserCrashError,
  CodegenLocatorError,
  CodegenStructuralError,
  CodegenValidationError,
  CodegenVersionError,
  ElementNotFoundError,
  FileOutsideRootError,
  FileTooLargeError,
  SessionBusyError,
  SessionDeadError,
  SessionNotFoundError,
  SessionPausedError,
  StateDriftError,
  WorkerShuttingDownError,
  WorkerUnavailableError
} from "../../src/shared/errors.js";
import { toMcpToolError } from "../../src/mcp/tools/error-mapper.js";

describe("toMcpToolError", () => {
  const cases: Array<[unknown, string]> = [
    [new WorkerUnavailableError(), "temporarily unavailable"],
    [new WorkerShuttingDownError(), "shutting down"],
    [new SessionNotFoundError("s1"), "browser_session"],
    [new SessionDeadError("s1"), "action:'resume'"],
    [new SessionPausedError("s1"), "resume_from_pause"],
    [new SessionBusyError("s1"), "busy"],
    [new ElementNotFoundError(), "Element not found"],
    [new StateDriftError(), "stale"],
    [new BrowserCrashError(), "browser_session"],
    [new FileOutsideRootError("x"), "outside the project root"],
    [new FileTooLargeError(1), "maximum size"],
    [
      new ApiRequestFailedError("GET https://x.invalid/ failed: getaddrinfo ENOTFOUND"),
      "didn't respond"
    ],
    [new Error("secret stack"), "unexpected"]
  ];

  it("logs and maps generic unhandled errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = toMcpToolError(new Error("secret stack"));
    expect(result.isError).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("unexpected");
    expect(text).toContain("output channel");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.each(cases)("maps %p", (err, snippet) => {
    const result = toMcpToolError(err);
    expect(result.isError).toBe(true);
    const first = result.content[0];
    const text = first !== undefined && first.type === "text" ? first.text : "";
    expect(text).toContain(snippet);
    expect(text.includes("stack")).toBe(false);
    expect(text.includes("Error:")).toBe(false);
  });

  it("never tells the agent the Vindicate worker is unavailable for an unreachable target API", () => {
    // Regression guard: api.request_failed also carries HTTP 502 on the wire, same as a genuinely
    // down worker — this must map to ApiRequestFailedError specifically, never WorkerUnavailableError,
    // which instructs the agent to stop calling all Vindicate tools entirely.
    const result = toMcpToolError(
      new ApiRequestFailedError("GET https://x.invalid/ failed: timeout")
    );
    const first = result.content[0];
    const text = first !== undefined && first.type === "text" ? first.text : "";
    expect(text).not.toContain("Vindicate runtime worker is temporarily unavailable");
    expect(text).toContain("other Vindicate tools are unaffected");
  });

  it("surfaces the worker's specific ElementNotFound reason and points to browser_diagnose", () => {
    const result = toMcpToolError(
      new ElementNotFoundError(
        undefined,
        "ref 'ref-x' is from a previous page (was /a, now /b) — call browser_read and retry"
      )
    );
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("from a previous page");
    expect(text).toContain("browser_diagnose");
  });

  describe("codegen errors", () => {
    it("maps CodegenValidationError to structured schema_validation JSON", () => {
      const result = toMcpToolError(
        new CodegenValidationError(
          "pages.0.steps.0.actions.0.do",
          "Unknown action 'clck'",
          "Did you mean 'click'?"
        )
      );
      const payload = JSON.parse(
        result.content[0]?.type === "text" ? result.content[0].text : "{}"
      ) as { error: string; field: string; message: string; fix: string };
      expect(payload.error).toBe("schema_validation");
      expect(payload.field).toBe("pages.0.steps.0.actions.0.do");
      expect(payload.fix).toContain("click");
    });

    it("maps CodegenStructuralError to structural_check JSON", () => {
      const result = toMcpToolError(
        new CodegenStructuralError("Barrel anchor not found", "Restore the anchor comment")
      );
      const payload = JSON.parse(
        result.content[0]?.type === "text" ? result.content[0].text : "{}"
      ) as { error: string; message: string; fix: string };
      expect(payload.error).toBe("structural_check");
      expect(payload.message).toContain("Barrel anchor");
      expect(payload.fix.length).toBeGreaterThan(0);
    });

    it("maps CodegenVersionError to version mismatch guidance", () => {
      const result = toMcpToolError(
        new CodegenVersionError("Schema is v99, generator expects v1.")
      );
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      expect(text).toContain("Schema version mismatch");
      expect(text).not.toContain("stack");
    });

    it("maps CodegenLocatorError to locator_derive JSON", () => {
      const result = toMcpToolError(new CodegenLocatorError("ref 'x' has no testid"));
      const payload = JSON.parse(
        result.content[0]?.type === "text" ? result.content[0].text : "{}"
      ) as { error: string; message: string; fix: string };
      expect(payload.error).toBe("locator_derive");
      expect(payload.fix).toContain("testid");
    });
  });
});

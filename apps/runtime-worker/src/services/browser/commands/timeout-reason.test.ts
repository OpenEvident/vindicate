import { describe, expect, it } from "vitest";

import { extractTimeoutReason } from "./timeout-reason.js";

const ESC = String.fromCharCode(27);
/** Wrap a call-log line the way Playwright's real TTY-colourized output does: ESC[2m ... ESC[22m. */
function dim(line: string): string {
  return `${ESC}[2m${line}${ESC}[22m`;
}

describe("extractTimeoutReason", () => {
  it("returns the last meaningful actionability condition from a Playwright call log", () => {
    const message = [
      "locator.click: Timeout 10000ms exceeded.",
      "Call log:",
      "  - waiting for locator('button')",
      "    - locator resolved to <button disabled>Sign In</button>",
      "    - element is not enabled",
      "    - retrying click action",
      "    - waiting 20ms",
      "    - element is not enabled",
      "    - retrying click action"
    ].join("\n");

    expect(extractTimeoutReason(message)).toBe("element is not enabled");
  });

  it("strips real ANSI colour codes before matching call-log lines (Playwright's actual TTY output)", () => {
    const message = [
      "locator.click: Timeout 3000ms exceeded.",
      "Call log:",
      dim("  - waiting for locator('//button[@type=\"submit\"]')"),
      dim('    - locator resolved to <button disabled type="submit"></button>'),
      dim("  - attempting click action"),
      dim("    2 × waiting for element to be visible, enabled and stable"),
      dim("      - element is not visible"),
      dim("    - retrying click action"),
      dim("    - waiting 20ms")
    ].join("\n");

    expect(extractTimeoutReason(message)).toBe("element is not visible");
  });

  it("falls back to the last raw log line when every line is noise", () => {
    const message = ["Timeout exceeded.", "Call log:", "  - waiting for locator('button')"].join(
      "\n"
    );

    expect(extractTimeoutReason(message)).toBe("waiting for locator('button')");
  });

  it("returns undefined when the message has no call-log lines", () => {
    expect(extractTimeoutReason("Timeout 10000ms exceeded.")).toBeUndefined();
  });

  it("truncates an overly long reason", () => {
    const longReason = "x".repeat(300);
    const message = `Timeout exceeded.\nCall log:\n  - ${longReason}`;

    const result = extractTimeoutReason(message);
    expect(result?.length).toBe(200);
    expect(result?.endsWith("…")).toBe(true);
  });
});

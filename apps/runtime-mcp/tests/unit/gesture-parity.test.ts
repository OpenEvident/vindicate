/**
 * Parity guard — MCP browser_act verbs and codegen actions must map to known worker gestures.
 *
 * Adding a new gesture checklist: see apps/runtime-worker/tests/unit/gesture-parity.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { VALID_ACTIONS } from "../../src/codegen/schema.js";

const mcpRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Worker live gestures that browser_act / codegen must stay aligned with (HTTP-only cross-package seam). */
const EXPECTED_WORKER_LIVE_GESTURES = new Set([
  "click",
  "type",
  "fill",
  "select_option",
  "scroll_by",
  "press_key",
  "hover",
  "dblclick",
  "drag",
  "check",
  "uncheck",
  "wait_for_response",
  "handle_dialog",
  "upload_file"
]);

/** browser_act short verbs → worker action names (must match browser-act-tool ACTION_MAP + pass-through). */
const BROWSER_ACT_TO_WORKER: Record<string, string> = {
  click: "click",
  type: "type",
  fill: "fill",
  select: "select_option",
  scroll: "scroll_by",
  press: "press_key",
  hover: "hover",
  dblclick: "dblclick",
  drag: "drag",
  check: "check",
  uncheck: "uncheck",
  wait_for_response: "wait_for_response",
  accept_dialog: "handle_dialog",
  dismiss_dialog: "handle_dialog",
  upload: "upload_file"
};

/** Codegen `do` values that execute a live browser gesture on the worker. */
const CODEGEN_LIVE_GESTURES: Record<string, string> = {
  fill: "fill",
  click: "click",
  click_if_visible: "click",
  hover: "hover",
  check: "check",
  uncheck: "uncheck",
  select: "select_option",
  press: "press_key",
  upload: "upload_file",
  dblclick: "dblclick",
  drag: "drag",
  scroll: "scroll_by"
};

function readMcpSource(rel: string): string {
  return readFileSync(path.join(mcpRoot, rel), "utf8");
}

describe("MCP gesture parity", () => {
  const browserActSource = readMcpSource("src/mcp/tools/browser-act-tool.ts");

  it("every browser_act verb resolves to an expected worker gesture", () => {
    for (const [verb, workerAction] of Object.entries(BROWSER_ACT_TO_WORKER)) {
      expect(browserActSource).toContain(`"${verb}"`);
      expect(EXPECTED_WORKER_LIVE_GESTURES.has(workerAction)).toBe(true);
    }
  });

  it("every codegen live gesture is in VALID_ACTIONS and maps to a worker counterpart", () => {
    const valid = new Set(VALID_ACTIONS);
    for (const [codegenDo, workerAction] of Object.entries(CODEGEN_LIVE_GESTURES)) {
      expect(valid.has(codegenDo as (typeof VALID_ACTIONS)[number])).toBe(true);
      expect(EXPECTED_WORKER_LIVE_GESTURES.has(workerAction)).toBe(true);
    }
  });
});

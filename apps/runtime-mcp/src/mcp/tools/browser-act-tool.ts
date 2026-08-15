/** MCP tool for deterministic ref-primary browser actions with intent fallback. */
import { UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner, WorkerStep } from "../../worker/worker-client.interface.js";
import { logger } from "../../core/logger.js";
import { toMcpToolError } from "./error-mapper.js";
import { normalizeRef } from "./ref-utils.js";
import { toolJson } from "./result.js";

const ACTION_MAP: Record<string, string> = {
  select: "select_option",
  scroll: "scroll_by",
  press: "press_key",
  upload: "upload_file"
};

/** @internal Exported for unit tests. */
export const REDACTED_LOG_VALUE = "[REDACTED]";

const ACTIONS_WITH_SENSITIVE_VALUE = new Set([
  "fill",
  "type",
  "select",
  "accept_dialog",
  "dismiss_dialog"
]);

/** @internal Exported for unit tests. */
export function redactBrowserActLogArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  const action = out.action;
  if (
    typeof action === "string" &&
    ACTIONS_WITH_SENSITIVE_VALUE.has(action) &&
    typeof out.value === "string"
  ) {
    out.value_len = out.value.length;
    out.value = REDACTED_LOG_VALUE;
  }
  return out;
}

function buildWorkerStep(
  workerAction: string,
  ref: string | undefined,
  args: {
    value?: string;
    files?: string[];
    sample?: "image" | "pdf" | "csv" | "txt";
    button?: "left" | "right" | "middle";
    key?: string;
    delta_x?: number;
    delta_y?: number;
    to_ref?: string;
    strategy?: "manual" | "native";
    steps?: number;
    timeout_ms?: number;
  }
): WorkerStep {
  const step: WorkerStep = { action: workerAction };
  if (ref !== undefined) {
    step.ref = normalizeRef(ref);
  }

  if (workerAction === "type") {
    step.value = args.value ?? "";
    if (args.value === "" || args.value === undefined) {
      step.clear_first = true;
    }
  } else if (workerAction === "fill" && args.value !== undefined) {
    step.value = args.value;
  } else if (workerAction === "select_option" && args.value !== undefined) {
    step.value = args.value;
  } else if (workerAction === "upload_file") {
    if (args.files !== undefined) {
      step.files = args.files;
    } else if (args.sample !== undefined) {
      step.sample = args.sample;
    }
  } else if (workerAction === "click" && args.button !== undefined) {
    step.button = args.button;
  } else if (workerAction === "press_key" && args.key !== undefined) {
    step.key = args.key;
  } else if (workerAction === "scroll_by") {
    const dx = args.delta_x ?? 0;
    const dy = args.delta_y ?? 300;
    if (Math.abs(dy) >= Math.abs(dx)) {
      step.direction = dy >= 0 ? "down" : "up";
      step.amount_px = Math.max(1, Math.abs(dy));
    } else {
      step.direction = dx >= 0 ? "right" : "left";
      step.amount_px = Math.max(1, Math.abs(dx));
    }
  } else if (workerAction === "drag") {
    if (args.to_ref === undefined) {
      throw new Error("browser_act drag requires to_ref — the drop target ref from browser_read");
    }
    step.to_ref = normalizeRef(args.to_ref);
    if (args.strategy !== undefined) {
      step.strategy = args.strategy;
    }
    if (args.steps !== undefined) {
      step.steps = args.steps;
    }
  }

  if (args.timeout_ms !== undefined) {
    step.timeout_ms = args.timeout_ms;
  }

  return step;
}

/** @internal Exported for unit tests. */
export const buildWorkerStepForTest = buildWorkerStep;

export function registerBrowserActTool(server: McpServer, workerClient: ICommandRunner): void {
  server.registerTool(
    "browser_act",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Perform an action on an element. Primary path is `ref` from `browser_read` for deterministic, test-safe interaction; fallback to `target` only when you have no ref. Supports `fill` (value-set incl. range sliders), `hover`, `dblclick`, `drag` (source ref + `to_ref`), dialogs, uploads, checkboxes, and SPA submits (`wait_for_response`). Use `type` only for keystroke-sensitive fields; prefer `fill` by default. `timeout_ms` caps the wait for this action. On click round-trips, the result includes `url_before`, `url_after`, and `url_trail` — re-read against the current page before the next action.",
      inputSchema: {
        session_id: UuidSchema,
        action: z.enum([
          "click",
          "type",
          "fill",
          "select",
          "scroll",
          "press",
          "hover",
          "dblclick",
          "drag",
          "check",
          "uncheck",
          "wait_for_response",
          "accept_dialog",
          "dismiss_dialog",
          "upload"
        ]),
        ref: z.string().optional(),
        to_ref: z.string().optional(),
        target: z.string().optional(),
        value: z.string().optional(),
        files: z.array(z.string()).optional(),
        sample: z.enum(["image", "pdf", "csv", "txt"]).optional(),
        scope: z.string().optional(),
        url_pattern: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
        button: z.enum(["left", "right", "middle"]).optional(),
        key: z.string().optional(),
        delta_x: z.number().optional(),
        delta_y: z.number().optional(),
        strategy: z.enum(["manual", "native"]).optional(),
        steps: z.number().int().positive().optional()
      }
    },
    async (args) => {
      try {
        logger.info(
          redactBrowserActLogArgs(args as Record<string, unknown>),
          "[browser_act] request"
        );

        if (args.action === "wait_for_response") {
          if (args.url_pattern === undefined || args.url_pattern.length === 0) {
            return toMcpToolError(
              new Error(
                "browser_act wait_for_response requires url_pattern — substring to match in response URL"
              )
            );
          }
          const step: WorkerStep = {
            action: "wait_for_response",
            url_pattern: args.url_pattern,
            ...(args.timeout_ms !== undefined ? { timeout_ms: args.timeout_ms } : {})
          };
          const result = await workerClient.runStep(args.session_id, step);
          return toolJson(result.result, "browser_act");
        }

        if (args.action === "accept_dialog" || args.action === "dismiss_dialog") {
          const result = await workerClient.runStep(args.session_id, {
            action: "handle_dialog",
            dialog_action: args.action === "accept_dialog" ? "accept" : "dismiss",
            ...(args.value !== undefined ? { prompt_text: args.value } : {})
          });
          return toolJson(result.result, "browser_act");
        }

        let resolvedRef = args.ref;
        if (resolvedRef === undefined && args.target !== undefined) {
          const resolutionStep: WorkerStep = {
            action: "resolve_target",
            target: args.target,
            ...(args.scope !== undefined ? { scope: args.scope } : {})
          };
          const resolution = await workerClient.runStep(args.session_id, resolutionStep);
          const body = resolution.result as Record<string, unknown>;
          const type = body.type;
          if (type === "not_found") {
            return toMcpToolError(
              new Error(
                `Target '${args.target}' not found among captured elements. If you already called browser_read and the target is still missing: plain, non-interactive text (a label, an amount, a summary row with no role/id/data-testid) is only captured inside an explicit scope, not a full-page read — scope:{ref}/{css} into its container and re-read. If you haven't read the page yet, call browser_read first.`
              )
            );
          }
          if (type === "ambiguous") {
            return toolJson({
              error: "ambiguous_target",
              message: `Target '${args.target}' matched multiple elements — retry with ref from candidates`,
              candidates: body.candidates
            });
          }
          if (typeof body.ref === "string") {
            resolvedRef = body.ref;
          }
        }

        if (resolvedRef === undefined && args.action !== "press") {
          return toMcpToolError(
            new Error(
              "browser_act requires ref (from browser_read) or target (natural language) — provide one to identify the element"
            )
          );
        }

        if (args.action === "drag" && args.to_ref === undefined) {
          return toMcpToolError(
            new Error("browser_act drag requires to_ref — the drop-target ref from browser_read")
          );
        }

        if (args.action === "fill" && args.value === undefined) {
          return toMcpToolError(
            new Error("browser_act fill requires value — the value to set on the element")
          );
        }

        if (
          args.action === "upload" &&
          (args.files === undefined || args.files.length === 0) &&
          args.sample === undefined
        ) {
          return toMcpToolError(
            new Error(
              "browser_act upload requires files (absolute paths on the worker host) or sample (image|pdf|csv|txt, resolved on the worker)"
            )
          );
        }

        const workerAction = ACTION_MAP[args.action] ?? args.action;
        const step = buildWorkerStep(workerAction, resolvedRef, {
          ...(args.value !== undefined ? { value: args.value } : {}),
          ...(args.files !== undefined ? { files: args.files } : {}),
          ...(args.sample !== undefined ? { sample: args.sample } : {}),
          ...(args.button !== undefined ? { button: args.button } : {}),
          ...(args.key !== undefined ? { key: args.key } : {}),
          ...(args.delta_x !== undefined ? { delta_x: args.delta_x } : {}),
          ...(args.delta_y !== undefined ? { delta_y: args.delta_y } : {}),
          ...(args.to_ref !== undefined ? { to_ref: args.to_ref } : {}),
          ...(args.strategy !== undefined ? { strategy: args.strategy } : {}),
          ...(args.steps !== undefined ? { steps: args.steps } : {}),
          ...(args.timeout_ms !== undefined ? { timeout_ms: args.timeout_ms } : {})
        });

        // When the agent asks for a longer action timeout, raise the client fetch ceiling above it
        // (+ margin) so the request isn't severed before the worker's (capped) action timeout fires.
        const runOptions =
          args.timeout_ms !== undefined ? { timeoutMs: args.timeout_ms + 10_000 } : undefined;
        const result = await workerClient.runStep(args.session_id, step, runOptions);
        logger.info(
          {
            session_id: args.session_id,
            action: args.action,
            ref: resolvedRef,
            result: result.result
          },
          "[browser_act] response"
        );
        return toolJson(result.result, "browser_act");
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

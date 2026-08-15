/**
 * @file MCP tool for filling multiple known fields in one round trip.
 *
 * Scope is deliberately narrow: data entry (fill/type/check/uncheck/select) against refs the agent
 * already has from a `browser_read` — never fuzzy `target` resolution, never click/navigate/drag.
 * Steps run sequentially server-side (same `runSteps` batch machinery every `browser_act` call already
 * uses at N=1) and stop at the first failure — this tool never continues past a broken field and guesses.
 *
 * Not for forms that reveal new fields as earlier ones are filled (wave/progressive reveal, e.g. a
 * postal code triggering an address lookup) — a batch can only ever include refs that already exist in
 * the last read; use `browser_act` one field at a time for those and re-read between fields.
 */
import { UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner, WorkerStep } from "../../worker/worker-client.interface.js";
import { logger } from "../../core/logger.js";
import { toMcpToolError } from "./error-mapper.js";
import { normalizeRef } from "./ref-utils.js";
import { toolJson } from "./result.js";

export const FILL_FORM_ACTIONS = ["fill", "type", "check", "uncheck", "select"] as const;
export type FillFormAction = (typeof FILL_FORM_ACTIONS)[number];

export interface FillFormField {
  readonly ref: string;
  readonly action: FillFormAction;
  readonly value?: string | undefined;
  readonly clear_first?: boolean | undefined;
}

/** @internal Exported for unit tests. */
export const REDACTED_LOG_VALUE = "[REDACTED]";

const ACTIONS_WITH_SENSITIVE_VALUE = new Set<FillFormAction>(["fill", "type", "select"]);

/** @internal Exported for unit tests. */
export function redactFillFormLogFields(
  fields: readonly FillFormField[]
): ReadonlyArray<Record<string, unknown>> {
  return fields.map((f) => {
    if (ACTIONS_WITH_SENSITIVE_VALUE.has(f.action) && typeof f.value === "string") {
      return { ref: f.ref, action: f.action, value: REDACTED_LOG_VALUE, value_len: f.value.length };
    }
    return { ref: f.ref, action: f.action };
  });
}

/**
 * Validates and renders each field to a worker step, in order. Throws on the first invalid field
 * (before any network call) naming the field's position and ref so the agent can fix its input —
 * mirrors `browser_act`'s own upfront-validation style (e.g. "fill requires value").
 */
export function buildFillFormSteps(fields: readonly FillFormField[]): WorkerStep[] {
  return fields.map((field, index) => {
    const label = `Field ${index} (${field.ref}, action '${field.action}')`;
    const ref = normalizeRef(field.ref);

    if (field.action === "check" || field.action === "uncheck") {
      if (field.value !== undefined) {
        throw new Error(
          `${label} does not take 'value' — check/uncheck only toggle the element itself.`
        );
      }
      return { action: field.action, ref };
    }

    if (field.value === undefined) {
      throw new Error(`${label} requires 'value'.`);
    }

    if (field.action === "select") {
      return { action: "select_option", ref, value: field.value };
    }

    if (field.action === "type") {
      const step: WorkerStep = { action: "type", ref, value: field.value };
      if (field.value.length === 0) {
        step.clear_first = true;
      }
      return step;
    }

    // fill
    return { action: "fill", ref, value: field.value };
  });
}

interface FieldOutcome {
  readonly ref: string;
  readonly action: FillFormAction;
}

/** @internal Exported for unit tests. */
export interface FillFormSuccessResult {
  readonly ok: true;
  readonly fields: ReadonlyArray<
    FieldOutcome & { readonly ok: boolean; readonly hint?: string; readonly selected?: string[] }
  >;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Shapes the success response, passing each field's own result through (`hint`, `select`'s `selected`). */
export function formatFillFormSuccess(
  fields: readonly FillFormField[],
  stepResults: ReadonlyArray<{ readonly result: unknown }>
): FillFormSuccessResult {
  return {
    ok: true,
    fields: fields.map((field, index) => {
      const raw = stepResults[index]?.result;
      const record =
        typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const stepOk = record.ok !== false;
      const hint = typeof record.hint === "string" ? record.hint : undefined;
      const selected = isStringArray(record.selected) ? record.selected : undefined;
      return {
        ref: field.ref,
        action: field.action,
        ok: stepOk,
        ...(hint !== undefined ? { hint } : {}),
        ...(selected !== undefined ? { selected } : {})
      };
    })
  };
}

/** @internal Exported for unit tests. */
export interface FillFormFailureResult {
  readonly ok: false;
  readonly failed_at: { readonly index: number; readonly ref: string; readonly action: string };
  readonly error: string;
  readonly completed: readonly FieldOutcome[];
  readonly remaining: readonly FieldOutcome[];
  readonly hint: string;
}

export interface FillFormFailedEvent {
  readonly step: number;
  readonly action?: unknown;
  readonly error?: unknown;
}

function asFailedEvent(event: Record<string, unknown>): FillFormFailedEvent | undefined {
  if (event.event !== "failed" || typeof event.step !== "number") {
    return undefined;
  }
  return { step: event.step, action: event.action, error: event.error };
}

/**
 * Shapes the failure response when a field-level error stopped the batch partway through. `remaining`
 * deliberately includes the failed field itself, not just the ones after it — its own state is
 * unconfirmed (the action may have partially applied before failing), so it must be re-verified rather
 * than assumed either done or not-done. Mirrors the existing ActionTimeoutError guidance elsewhere in
 * this codebase ("the action may still be running... do not retry it, it could apply twice").
 */
export function formatFillFormFailure(
  fields: readonly FillFormField[],
  failedEvent: FillFormFailedEvent
): FillFormFailureResult {
  const index = failedEvent.step;
  const failedField = fields[index];
  const ref = failedField?.ref ?? "unknown";
  const action =
    typeof failedEvent.action === "string"
      ? failedEvent.action
      : (failedField?.action ?? "unknown");
  const errorMessage =
    typeof failedEvent.error === "string" ? failedEvent.error : "Field action failed";
  const completed = fields.slice(0, index).map((f) => ({ ref: f.ref, action: f.action }));
  const remaining = fields.slice(index).map((f) => ({ ref: f.ref, action: f.action }));

  return {
    ok: false,
    failed_at: { index, ref, action },
    error: errorMessage,
    completed,
    remaining,
    hint:
      `${completed.length} of ${fields.length} field(s) were set before this failure. ` +
      "Call browser_read to confirm current state (including the failed field, whose own effect is " +
      "unconfirmed), then continue the remaining fields individually with browser_act."
  };
}

/** Batch-size-aware client fetch timeout: per-field default matches the worker's own default action
 *  timeout (30s), so the outer HTTP request never gets aborted while the server is still working
 *  through a long-but-healthy batch. */
const DEFAULT_FIELD_TIMEOUT_MS = 30_000;
const TIMEOUT_MARGIN_MS = 10_000;
const MAX_FIELDS = 30;

export function registerBrowserFillFormTool(server: McpServer, workerClient: ICommandRunner): void {
  server.registerTool(
    "browser_fill_form",
    {
      description:
        "Fill multiple known fields in one round trip instead of one browser_act call per field. " +
        "Only for fields already visible in your last browser_read — every ref must exist; " +
        "this tool never guesses or re-reads mid-batch. Not for forms that reveal new fields as earlier " +
        "ones are filled (e.g. a postal code triggering an address lookup) — for those, fill visible " +
        "fields with browser_act one at a time and re-read between fields. Runs fields in order " +
        "and stops at the first failure; the response reports which field failed and which " +
        "were already set, so you can verify and continue individually. Supports fill, type " +
        "(real keystrokes — use when fill's response carries a field-reads-back-empty hint), check, " +
        "uncheck, select (dropdown value).",
      inputSchema: {
        session_id: UuidSchema,
        fields: z
          .array(
            z.object({
              ref: z.string().min(1),
              action: z.enum(FILL_FORM_ACTIONS),
              value: z.string().optional(),
              clear_first: z.boolean().optional()
            })
          )
          .min(1)
          .max(MAX_FIELDS),
        timeout_ms: z.number().int().positive().optional()
      }
    },
    async (args) => {
      try {
        logger.info(
          { session_id: args.session_id, fields: redactFillFormLogFields(args.fields) },
          "[browser_fill_form] request"
        );

        let steps: WorkerStep[];
        try {
          steps = buildFillFormSteps(args.fields);
        } catch (err: unknown) {
          return toMcpToolError(err);
        }

        if (args.timeout_ms !== undefined) {
          for (const step of steps) {
            step.timeout_ms = args.timeout_ms;
          }
        }

        const perFieldTimeout = args.timeout_ms ?? DEFAULT_FIELD_TIMEOUT_MS;
        const batchTimeoutMs = args.fields.length * perFieldTimeout + TIMEOUT_MARGIN_MS;

        let capturedFailure: FillFormFailedEvent | undefined;
        try {
          const { steps: stepResults } = await workerClient.runSteps(args.session_id, steps, {
            timeoutMs: batchTimeoutMs,
            onEvent: (event) => {
              const failed = asFailedEvent(event);
              if (failed !== undefined) {
                capturedFailure = failed;
              }
            }
          });
          const response = formatFillFormSuccess(args.fields, stepResults);
          logger.info(
            { session_id: args.session_id, ok: true, field_count: args.fields.length },
            "[browser_fill_form] response"
          );
          return toolJson(response, "browser_fill_form");
        } catch (err: unknown) {
          if (capturedFailure !== undefined) {
            const response = formatFillFormFailure(args.fields, capturedFailure);
            logger.info(
              { session_id: args.session_id, ok: false, failed_at: response.failed_at },
              "[browser_fill_form] response"
            );
            return toolJson(response, "browser_fill_form");
          }
          return toMcpToolError(err);
        }
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

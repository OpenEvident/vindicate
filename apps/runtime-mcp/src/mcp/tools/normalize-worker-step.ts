/**
 * @file Normalise MCP / agent step payloads to runtime-worker command schemas.
 */

const REF_PATTERN = /^ref-[0-9a-f]{8}$/;

/** Map common agent aliases to worker action names and field names. */
export function normalizeWorkerStep(raw: Record<string, unknown>): Record<string, unknown> {
  let step: Record<string, unknown> = { ...raw };

  if (step.action === undefined && typeof step.type === "string") {
    const { type, ...rest } = step;
    step = { action: type, ...rest };
  }

  const action = step.action;
  if (typeof action !== "string") {
    return step;
  }

  if (action === "fill") {
    step.action = "type";
  }

  if (step.action === "type") {
    if (step.value === undefined && typeof step.text === "string") {
      step.value = step.text;
      delete step.text;
    }
    if (step.clear_first === undefined && typeof step.clear === "boolean") {
      step.clear_first = step.clear;
      delete step.clear;
    }
  }

  if (typeof step.ref === "string" && !REF_PATTERN.test(step.ref)) {
    // Agents often pass bare ids from snapshots; worker requires ref-xxxxxxxx.
    const bare = step.ref.replace(/^ref-?/i, "");
    if (/^[0-9a-f]{8}$/i.test(bare)) {
      step.ref = `ref-${bare.toLowerCase()}`;
    }
  }

  return step;
}

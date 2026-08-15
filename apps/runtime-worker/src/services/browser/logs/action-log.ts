/**
 * @file Bounded per-session action audit log (BROWSER-SERVICE §9).
 */
import { RingBuffer } from "../../../shared/ring-buffer.js";
import type { ActionLogAppendInput, ActionLogEntry } from "./action-log.types.js";

const SENSITIVE_KEY_RE = /password|secret|token|api[_-]?key|authorization/i;
const ALWAYS_REDACT_KEYS = new Set(["value", "prompt_text"]);

export function redactActionParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEY_RE.test(key) || ALWAYS_REDACT_KEYS.has(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactActionParams(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

interface SessionActionState {
  nextSeq: number;
  readonly buffer: RingBuffer<ActionLogEntry>;
}

export class SessionActionLog {
  private readonly sessions = new Map<string, SessionActionState>();

  constructor(private readonly capacity: number) {}

  drop(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  append(sessionId: string, input: ActionLogAppendInput): ActionLogEntry {
    let state = this.sessions.get(sessionId);
    if (state === undefined) {
      state = { nextSeq: 0, buffer: new RingBuffer(this.capacity) };
      this.sessions.set(sessionId, state);
    }
    const seq = state.nextSeq;
    state.nextSeq += 1;
    const entry: ActionLogEntry = {
      seq,
      action: input.action,
      params: redactActionParams(input.params),
      result: input.result,
      duration_ms: input.duration_ms,
      timestamp_ms: Date.now(),
      ...(input.error_code !== undefined ? { error_code: input.error_code } : {}),
      ...(input.snapshot_id_before !== undefined
        ? { snapshot_id_before: input.snapshot_id_before }
        : {}),
      ...(input.snapshot_id_after !== undefined
        ? { snapshot_id_after: input.snapshot_id_after }
        : {})
    };
    state.buffer.push(entry);
    return entry;
  }

  query(sessionId: string, filters: { readonly limit?: number | undefined }): ActionLogEntry[] {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      return [];
    }
    let rows = [...state.buffer.snapshot()];
    if (filters.limit !== undefined) {
      rows = rows.slice(-filters.limit);
    }
    return rows;
  }
}

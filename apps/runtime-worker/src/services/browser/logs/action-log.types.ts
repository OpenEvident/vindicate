/**
 * @file Per-session action audit log entries (BROWSER-SERVICE §9).
 */
export interface ActionLogEntry {
  readonly seq: number;
  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly result: "success" | "failure";
  readonly error_code?: string;
  readonly duration_ms: number;
  readonly snapshot_id_before?: number;
  readonly snapshot_id_after?: number;
  readonly timestamp_ms: number;
}

export interface ActionLogAppendInput {
  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly result: "success" | "failure";
  readonly duration_ms: number;
  readonly error_code?: string;
  readonly snapshot_id_before?: number;
  readonly snapshot_id_after?: number;
}

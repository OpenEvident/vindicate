/**
 * @file Console / network log entry shapes (BROWSER-SERVICE §6.3–6.4).
 */
export type ConsoleLogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleLogEntry {
  readonly level: ConsoleLogLevel;
  readonly message: string;
  readonly timestamp_ms: number;
  readonly snapshot_id_at_capture: number;
}

export interface NetworkLogEntry {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly duration_ms: number;
  readonly timestamp_ms: number;
  readonly snapshot_id_at_capture: number;
  readonly request_size_bytes?: number;
  readonly response_size_bytes?: number;
}

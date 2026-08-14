/** @file Wire types for the api_request tool — a stateless HTTP call, no browser session involved. */

export const API_REQUEST_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type ApiRequestMethod = (typeof API_REQUEST_METHODS)[number];

export const API_REQUEST_BODY_TYPES = ["json", "form"] as const;
export type ApiRequestBodyType = (typeof API_REQUEST_BODY_TYPES)[number];

export interface ApiRequestInput {
  readonly method: ApiRequestMethod;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly body_type?: ApiRequestBodyType;
  readonly params?: Record<string, string>;
  readonly timeout_ms?: number;
}

export interface ApiRequestResult {
  readonly status: number;
  readonly status_text: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  /** Parsed JSON, only present when the response's Content-Type is JSON and it actually parses. */
  readonly body_json?: unknown;
}

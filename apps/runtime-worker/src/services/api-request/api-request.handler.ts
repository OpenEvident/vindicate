/**
 * @file Core api_request logic — a fallback/gap-filler tool (mirrors browser_diagnose's role for
 * UI): only called during `ground` to fill a genuine information gap, or during `execute`/`heal` to
 * diagnose a real failure. Never a proactive double-check when the user already gave complete info.
 *
 * Built on Playwright's own request API (already a runtime-worker dependency via playwright-core,
 * no new dependency) — the same primitive `vindicate-api`-shaped generated test code itself uses, so
 * there's no drift between what this tool verifies and what the generated client actually does.
 */
import type { APIRequestContext } from "playwright-core";

import { ApiRequestFailedError, ValidationError } from "../../shared/errors/worker.errors.js";
import type { ApiRequestInput, ApiRequestResult } from "./api-request.types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType !== undefined && /\bjson\b/i.test(contentType);
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

/** The minimal slice of Playwright's APIRequestContext this handler actually needs — makes it
 * trivially testable with a fake `{ fetch }` object instead of a real network context. The route
 * layer owns constructing (and disposing) the real context, the same way interaction.handlers.ts
 * takes an already-open `Page` rather than creating one itself. */
export type ApiFetchContext = Pick<APIRequestContext, "fetch">;

export async function executeApiRequest(
  context: ApiFetchContext,
  input: ApiRequestInput
): Promise<ApiRequestResult> {
  if (input.body !== undefined && input.body_type === undefined) {
    throw new ValidationError("api_request: body_type is required when body is provided ('json' or 'form')");
  }
  if (input.body_type === "form" && !isPlainStringRecord(input.body)) {
    throw new ValidationError("api_request: body_type 'form' requires body to be a flat object of string values");
  }

  const timeoutMs = Math.min(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  let response: Awaited<ReturnType<ApiFetchContext["fetch"]>>;
  try {
    response = await context.fetch(input.url, {
      method: input.method,
      ...(input.headers !== undefined ? { headers: input.headers } : {}),
      ...(input.body !== undefined && input.body_type === "json" ? { data: input.body } : {}),
      ...(input.body !== undefined && input.body_type === "form" ? { form: input.body as Record<string, string> } : {}),
      ...(input.params !== undefined ? { params: input.params } : {}),
      timeout: timeoutMs
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiRequestFailedError(input.method, input.url, reason);
  }

  const headers = response.headers();
  const bodyText = await response.text();
  const contentType = headers["content-type"];

  let bodyJson: unknown;
  if (isJsonContentType(contentType) && bodyText.length > 0) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      // Body claimed JSON but wasn't parseable — leave body_json undefined, raw text is still returned.
    }
  }

  return {
    status: response.status(),
    status_text: response.statusText(),
    headers,
    body: bodyText,
    ...(bodyJson !== undefined ? { body_json: bodyJson } : {})
  };
}

import { describe, expect, it } from "vitest";

import { ApiRequestFailedError, WorkerUnavailableError, WorkerValidationError } from "../../src/shared/errors.js";
import { throwFromWorkerResponse } from "../../src/worker/worker-errors.js";

function fakeResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("throwFromWorkerResponse", () => {
  it("maps api.request_failed to ApiRequestFailedError, even though it carries HTTP 502", async () => {
    // Regression guard: the default branch below treats any 502 as WorkerUnavailableError (the
    // Vindicate worker itself is down) — api.request_failed must be matched explicitly first, since it
    // means the *target* API didn't respond, not the worker.
    const res = fakeResponse(
      { ok: false, error: "GET https://x.invalid/ failed: timeout", code: "api.request_failed" },
      502
    );
    await expect(throwFromWorkerResponse(res)).rejects.toBeInstanceOf(ApiRequestFailedError);
  });

  it("still maps a genuinely unrecognized 502 to WorkerUnavailableError", async () => {
    const res = fakeResponse({ ok: false, error: "boom" }, 502);
    await expect(throwFromWorkerResponse(res)).rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it("maps validation.invalid_params to WorkerValidationError", async () => {
    const res = fakeResponse({ ok: false, error: "bad body", code: "validation.invalid_params" }, 400);
    await expect(throwFromWorkerResponse(res)).rejects.toBeInstanceOf(WorkerValidationError);
  });
});

import { describe, expect, it, vi } from "vitest";

import { ApiRequestFailedError, ValidationError } from "../../shared/errors/worker.errors.js";
import { executeApiRequest, type ApiFetchContext } from "./api-request.handler.js";

function fakeResponse(overrides: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  text?: string;
}): Awaited<ReturnType<ApiFetchContext["fetch"]>> {
  const headers = overrides.headers ?? {};
  return {
    status: () => overrides.status ?? 200,
    statusText: () => overrides.statusText ?? "OK",
    headers: () => headers,
    text: () => Promise.resolve(overrides.text ?? "")
  } as unknown as Awaited<ReturnType<ApiFetchContext["fetch"]>>;
}

describe("executeApiRequest", () => {
  it("sends a GET with no body and returns status/headers/body", async () => {
    const fetch = vi.fn().mockResolvedValue(
      fakeResponse({ status: 200, statusText: "OK", headers: { "content-type": "text/plain" }, text: "hello" })
    );
    const context: ApiFetchContext = { fetch };

    const result = await executeApiRequest(context, { method: "GET", url: "https://example.com/thing" });

    expect(result.status).toBe(200);
    expect(result.status_text).toBe("OK");
    expect(result.body).toBe("hello");
    expect(result.body_json).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("https://example.com/thing", expect.objectContaining({ method: "GET" }));
  });

  it("parses body_json when Content-Type is JSON and the body actually parses", async () => {
    const fetch = vi.fn().mockResolvedValue(
      fakeResponse({ headers: { "content-type": "application/json; charset=utf-8" }, text: '{"id":1,"ok":true}' })
    );
    const result = await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing" });

    expect(result.body_json).toEqual({ id: 1, ok: true });
  });

  it("leaves body_json undefined when Content-Type claims JSON but the body doesn't parse", async () => {
    const fetch = vi.fn().mockResolvedValue(
      fakeResponse({ headers: { "content-type": "application/json" }, text: "not actually json" })
    );
    const result = await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing" });

    expect(result.body_json).toBeUndefined();
    expect(result.body).toBe("not actually json");
  });

  it("leaves body_json undefined when Content-Type is not JSON, even if the body happens to parse", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({ headers: { "content-type": "text/html" }, text: "123" }));
    const result = await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing" });

    expect(result.body_json).toBeUndefined();
  });

  it("forwards headers, params, and a JSON body to fetch", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({}));
    await executeApiRequest(
      { fetch },
      {
        method: "POST",
        url: "https://example.com/thing",
        headers: { Authorization: "Bearer tok" },
        body: { title: "hi" },
        body_type: "json",
        params: { verbose: "true" }
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/thing",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer tok" },
        data: { title: "hi" },
        params: { verbose: "true" }
      })
    );
  });

  it("forwards a form body as `form`, not `data`", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({}));
    await executeApiRequest(
      { fetch },
      { method: "POST", url: "https://example.com/thing", body: { a: "1", b: "2" }, body_type: "form" }
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/thing",
      expect.objectContaining({ form: { a: "1", b: "2" } })
    );
    const call = fetch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call.data).toBeUndefined();
  });

  it("rejects a body without body_type", async () => {
    const fetch = vi.fn();
    await expect(
      executeApiRequest({ fetch }, { method: "POST", url: "https://example.com/thing", body: { a: 1 } })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a form body that isn't a flat object of strings", async () => {
    const fetch = vi.fn();
    await expect(
      executeApiRequest(
        { fetch },
        { method: "POST", url: "https://example.com/thing", body: { a: 1 }, body_type: "form" }
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("wraps a network-level failure (DNS/connection/timeout) as ApiRequestFailedError", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.invalid"));
    await expect(
      executeApiRequest({ fetch }, { method: "GET", url: "https://example.invalid/thing" })
    ).rejects.toBeInstanceOf(ApiRequestFailedError);
  });

  it("never wraps a real HTTP response (even a 500) as an error — that's the tool's success case", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({ status: 500, statusText: "Internal Server Error" }));
    const result = await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing" });
    expect(result.status).toBe(500);
  });

  it("clamps an excessive timeout_ms to the configured maximum", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({}));
    await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing", timeout_ms: 999_999 });

    const call = fetch.mock.calls[0]?.[1] as { timeout: number };
    expect(call.timeout).toBe(60_000);
  });

  it("defaults the timeout when none is given", async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({}));
    await executeApiRequest({ fetch }, { method: "GET", url: "https://example.com/thing" });

    const call = fetch.mock.calls[0]?.[1] as { timeout: number };
    expect(call.timeout).toBe(15_000);
  });
});

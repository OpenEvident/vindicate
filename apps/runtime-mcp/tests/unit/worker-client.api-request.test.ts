import { describe, expect, it, vi } from "vitest";

import { ApiRequestFailedError } from "../../src/shared/errors.js";
import { WorkerClient } from "../../src/worker/worker-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function toRequestUrl(url: unknown): string {
  if (typeof url === "string") return url;
  if (url instanceof URL) return url.toString();
  return "";
}

function makeClient(fetchFn: typeof fetch): WorkerClient {
  return new WorkerClient({
    baseUrl: "http://worker",
    internalKey: "0123456789abcdef0123456789abcdef",
    retryTimeoutMs: 40,
    healthProbeMs: 10,
    fetchFn
  });
}

describe("WorkerClient.apiRequest", () => {
  it("POSTs the params to /api-request and returns the parsed response", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      expect(toRequestUrl(url)).toBe("http://worker/api-request");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toEqual({
        method: "GET",
        url: "https://example.com/thing"
      });
      return jsonResponse({
        status: 200,
        status_text: "OK",
        headers: {},
        body: "hello",
        body_json: undefined
      });
    });

    const client = makeClient(fetchFn);
    const result = await client.apiRequest({ method: "GET", url: "https://example.com/thing" });

    expect(result.status).toBe(200);
    expect(result.body).toBe("hello");
  });

  it("maps a worker api.request_failed response to ApiRequestFailedError, not a generic error", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          ok: false,
          error: "GET https://x.invalid/ failed: getaddrinfo ENOTFOUND",
          code: "api.request_failed"
        },
        502
      )
    );

    const client = makeClient(fetchFn);
    await expect(
      client.apiRequest({ method: "GET", url: "https://x.invalid/" })
    ).rejects.toBeInstanceOf(ApiRequestFailedError);
  });

  it("sends internal-key auth headers on the request", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-vindicate-internal-key"]).toBe("0123456789abcdef0123456789abcdef");
      return jsonResponse({ status: 200, status_text: "OK", headers: {}, body: "" });
    });

    const client = makeClient(fetchFn);
    await client.apiRequest({ method: "GET", url: "https://example.com/thing" });
  });
});

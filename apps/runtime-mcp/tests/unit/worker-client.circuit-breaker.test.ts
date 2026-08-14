import { describe, expect, it, vi } from "vitest";

import {
  SessionDeadError,
  WorkerShuttingDownError,
  WorkerUnavailableError
} from "../../src/shared/errors.js";
import { WorkerClient } from "../../src/worker/worker-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function toRequestUrl(url: unknown): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  if (
    typeof url === "object" &&
    url !== null &&
    "url" in url &&
    typeof (url as { url?: unknown }).url === "string"
  ) {
    return (url as { url: string }).url;
  }
  return "";
}

describe("WorkerClient circuit breaker", () => {
  it("attaches x-vindicate-internal-key on requests", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true, status: "ok" }));
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn
    });
    await client.health();
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({
      "x-vindicate-internal-key": "0123456789abcdef0123456789abcdef"
    });
  });

  it("healthy → down on connection refused then recovers", async () => {
    let calls = 0;
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      calls += 1;
      if (toRequestUrl(url).endsWith("/health")) {
        return jsonResponse({ ok: true });
      }
      if (calls === 2) {
        throw new TypeError("fetch failed");
      }
      return jsonResponse([]);
    });
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 500,
      healthProbeMs: 20,
      fetchFn
    });
    await client.listSessions();
    await expect(client.listSessions()).resolves.toEqual([]);
    expect(client.circuitState).toBe("healthy");
  });

  it("times out after retry window with WorkerUnavailableError", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("down");
    });
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 80,
      healthProbeMs: 20,
      fetchFn
    });
    await expect(client.listSessions()).rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it("rejects immediately when shutting down", async () => {
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse([]))
    });
    client.setWorkerShuttingDown(true);
    await expect(client.listSessions()).rejects.toBeInstanceOf(WorkerShuttingDownError);
  });

  it("fails fast when session is marked dead by worker events", async () => {
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({ steps: [] }))
    });
    client.markSessionDead("session-1");
    await expect(client.runStep("session-1", { action: "snapshot" })).rejects.toBeInstanceOf(
      SessionDeadError
    );
  });

  it("fails fast when worker is marked throttled", async () => {
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({ steps: [] }))
    });
    client.markWorkerThrottled(5_000);
    await expect(client.runStep("session-1", { action: "snapshot" })).rejects.toBeInstanceOf(
      WorkerUnavailableError
    );
  });
});

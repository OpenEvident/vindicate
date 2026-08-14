import { describe, expect, it, vi } from "vitest";

import { ActionTimeoutError } from "../../src/shared/errors.js";
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

describe("WorkerClient command timeout", () => {
  it("throws ActionTimeoutError instead of raw AbortError when fetch is aborted", async () => {
    let commandAttempts = 0;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const requestUrl = toRequestUrl(url);
      if (requestUrl.endsWith("/health")) {
        return jsonResponse({ ok: true });
      }
      if (requestUrl.includes("/commands")) {
        commandAttempts += 1;
        await new Promise<void>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal === undefined || signal === null) {
            reject(new Error("expected AbortSignal"));
            return;
          }
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      }
      return jsonResponse({ steps: [] });
    });

    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 40,
      healthProbeMs: 10,
      fetchFn
    });

    try {
      await client.runStep("e7d09d77-ba85-4239-bcd1-a6625393e382", { action: "snapshot" });
      throw new Error("expected ActionTimeoutError");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ActionTimeoutError);
      if (err instanceof ActionTimeoutError) {
        expect(err.message).toContain("timed out after 40ms");
      }
    }

    expect(commandAttempts).toBe(1);
  });

  it("does not retry ActionTimeoutError as a connection failure", async () => {
    let commandAttempts = 0;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const requestUrl = toRequestUrl(url);
      if (requestUrl.endsWith("/health")) {
        return jsonResponse({ ok: true });
      }
      if (requestUrl.includes("/commands")) {
        commandAttempts += 1;
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return jsonResponse([]);
    });

    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 30,
      healthProbeMs: 10,
      fetchFn
    });

    await expect(
      client.runStep("e7d09d77-ba85-4239-bcd1-a6625393e382", { action: "navigate", url: "https://example.com" })
    ).rejects.toBeInstanceOf(ActionTimeoutError);

    expect(commandAttempts).toBe(1);
  });
});

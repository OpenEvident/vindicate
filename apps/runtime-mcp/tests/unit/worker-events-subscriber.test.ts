import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionDeadError, WorkerUnavailableError } from "../../src/shared/errors.js";
import { startWorkerEventsSubscriber } from "../../src/worker/worker-events-subscriber.js";
import { WorkerClient } from "../../src/worker/worker-client.js";

function sseResponse(events: readonly Record<string, unknown>[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

describe("worker events subscriber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks sessions dead from worker events", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => sseResponse([{ event: "session_dead", session_id: "s-1" }])));
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn: vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ steps: [] }), { status: 200 }))
    });
    const stop = startWorkerEventsSubscriber(client);
    await vi.waitFor(async () => {
      await expect(client.runStep("s-1", { action: "snapshot" })).rejects.toBeInstanceOf(
        SessionDeadError
      );
    });
    stop();
  });

  it("marks worker throttled from worker events", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => sseResponse([{ event: "worker_throttled", retry_after_ms: 5000 }])));
    const client = new WorkerClient({
      baseUrl: "http://worker",
      internalKey: "0123456789abcdef0123456789abcdef",
      retryTimeoutMs: 100,
      healthProbeMs: 10,
      fetchFn: vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ steps: [] }), { status: 200 }))
    });
    const stop = startWorkerEventsSubscriber(client);
    await vi.waitFor(async () => {
      await expect(client.runStep("s-2", { action: "snapshot" })).rejects.toBeInstanceOf(
        WorkerUnavailableError
      );
    });
    stop();
  });
});

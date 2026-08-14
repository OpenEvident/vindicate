/**
 * @file Subscribes to runtime-worker /events and forwards high-value signals.
 */
import { logger } from "../core/logger.js";
import { parseSseStream } from "../shared/sse.js";
import type { WorkerClient } from "./worker-client.js";

export function startWorkerEventsSubscriber(workerClient: WorkerClient): () => void {
  const controller = new AbortController();

  const run = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${workerClient.baseUrl}/events`, {
          headers: { "x-vindicate-internal-key": workerClient.internalKey },
          signal: controller.signal
        });
        if (!response.ok) {
          logger.warn({ status: response.status }, "worker events subscription failed");
          await sleep(1_000);
          continue;
        }
        for await (const event of parseSseStream(response.body)) {
          if (controller.signal.aborted) {
            return;
          }
          handleEvent(workerClient, event);
        }
        await sleep(250);
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        logger.warn({ err }, "worker events stream disconnected; retrying");
        await sleep(1_000);
      }
    }
  };

  void run();
  return () => controller.abort();
}

function handleEvent(workerClient: WorkerClient, event: Record<string, unknown>): void {
  const name = typeof event["event"] === "string" ? event["event"] : "";
  if (name === "session_dead") {
    const sessionId = typeof event["session_id"] === "string" ? event["session_id"] : undefined;
    if (sessionId !== undefined) {
      workerClient.markSessionDead(sessionId);
      logger.warn({ sessionId }, "worker reported dead session");
    }
    return;
  }
  if (name === "worker_throttled") {
    const retryAfterMs =
      typeof event["retry_after_ms"] === "number" ? event["retry_after_ms"] : 2_000;
    workerClient.markWorkerThrottled(retryAfterMs);
    logger.warn({ retryAfterMs }, "worker reported throttling");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

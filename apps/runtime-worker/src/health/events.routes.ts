/**
 * @file Persistent SSE channel for worker → MCP push events (ARCHITECTURE §10).
 */
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { IEventBus, SequencedPushEvent } from "../core/events/event-bus.interface.js";

function sseWrite(reply: ServerResponse, data: unknown): void {
  reply.write(`data: ${JSON.stringify(data)}\n\n`);
}

export interface RegisterEventsRoutesOptions {
  readonly bufferSize: number;
}

export function registerEventsRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  eventBus: IEventBus,
  options: RegisterEventsRoutesOptions
): void {
  fastify.get("/events", (request, reply) => {
    const sinceRaw = (request.query as { since?: string }).since;
    const sinceSeq = sinceRaw === undefined || sinceRaw === "" ? 0 : Number(sinceRaw);
    if (!Number.isFinite(sinceSeq) || sinceSeq < 0) {
      void reply.status(400).send({
        ok: false,
        error: "Invalid ?since= sequence (expected non-negative number)",
        code: "validation.invalid_params"
      });
      return;
    }

    const oldest = eventBus.getOldestBufferedSeq();
    const hasGap = oldest !== undefined && sinceSeq < oldest - 1;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    if (hasGap) {
      const seq = eventBus.publish({
        event: "resync_required",
        message: "buffer_overflow",
        from_seq: sinceSeq,
        buffer_size: options.bufferSize
      });
      sseWrite(reply.raw, {
        seq,
        event: "resync_required",
        message: "buffer_overflow",
        from_seq: sinceSeq,
        buffer_size: options.bufferSize
      });
    } else {
      for (const entry of eventBus.getBuffered(sinceSeq)) {
        sseWrite(reply.raw, { seq: entry.seq, ...entry.payload });
      }
    }

    const unsubscribe = eventBus.subscribe((entry: SequencedPushEvent) => {
      sseWrite(reply.raw, { seq: entry.seq, ...entry.payload });
    });

    // Heartbeat comment keeps the stream active so client/proxy idle timeouts (undici bodyTimeout,
    // ~5 min) never tear down a quiet stream — e.g. a long human recording with pauses.
    const HEARTBEAT_MS = 20_000;
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(": ping\n\n");
      }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    let closed = false;
    const onClose = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    };

    request.raw.on("close", onClose);
  });
}

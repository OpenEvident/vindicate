/**
 * @file Validates x-vindicate-internal-key on all routes except GET /health and GET /ready.
 */
import { timingSafeEqual } from "node:crypto";

import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

const HEADER_NAME = "x-vindicate-internal-key";

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function isExemptPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return path === "/health" || path === "/ready";
}

export function registerInternalKeyMiddleware<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  expectedKey: string
): void {
  fastify.addHook("onRequest", (request: FastifyRequest, reply: FastifyReply, done) => {
    if (isExemptPath(request.url)) {
      done();
      return;
    }

    const provided = request.headers[HEADER_NAME];
    if (typeof provided !== "string" || !keyMatches(provided, expectedKey)) {
      void reply.status(401).send({
        ok: false,
        error: "Unauthorized",
        code: "auth.key_invalid"
      });
      return;
    }

    done();
  });
}

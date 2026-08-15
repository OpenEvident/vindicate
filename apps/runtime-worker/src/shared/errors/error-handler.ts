/**
 * @file Central Fastify error handler — maps {@link WorkerError} to JSON; never leaks stack traces.
 */
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "@vindicate/observability";

import {
  BrowserUnavailableError,
  NavigationFailedError,
  WorkerError,
  WorkerThrottledError
} from "./worker.errors.js";

export function registerErrorHandler<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  logger: Logger
): void {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkerError) {
      const body: Record<string, unknown> = {
        ok: false,
        error: error.message,
        code: error.code
      };
      if (error instanceof NavigationFailedError && error.status !== undefined) {
        body.status = error.status;
      }
      if (error instanceof WorkerThrottledError && error.retryAfterMs !== undefined) {
        body.retry_after_ms = error.retryAfterMs;
        void reply.header("Retry-After", String(Math.ceil(error.retryAfterMs / 1000)));
      }
      if (error instanceof BrowserUnavailableError && error.command !== undefined) {
        body.command = error.command;
      }
      return reply.status(error.httpStatus).send(body);
    }

    const validation = (error as { validation?: unknown }).validation;
    if (validation !== undefined) {
      return reply.status(400).send({
        ok: false,
        error: "Invalid request parameters",
        code: "validation.invalid_params"
      });
    }

    logger.error({ err: error }, "Unhandled worker error");
    return reply.status(500).send({
      ok: false,
      error: "Internal worker error",
      code: "worker.internal"
    });
  });
}

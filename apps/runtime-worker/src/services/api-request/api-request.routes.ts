/** @file Route for the stateless api_request tool — no browser session involved. */
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as playwrightRequest } from "playwright-core";
import { z } from "zod";

import { ValidationError } from "../../shared/errors/worker.errors.js";
import { executeApiRequest } from "./api-request.handler.js";
import { API_REQUEST_BODY_TYPES, API_REQUEST_METHODS } from "./api-request.types.js";
import type { ApiRequestInput } from "./api-request.types.js";

const ApiRequestBodySchema = z.object({
  method: z.enum(API_REQUEST_METHODS),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  body_type: z.enum(API_REQUEST_BODY_TYPES).optional(),
  params: z.record(z.string(), z.string()).optional(),
  timeout_ms: z.number().int().positive().optional()
});

/** Narrows the zod-parsed body (whose optional fields are `T | undefined`) down to
 * `ApiRequestInput` (`exactOptionalPropertyTypes`-compatible — optional keys must be entirely
 * absent, never present-with-`undefined`). */
function toApiRequestInput(parsed: z.infer<typeof ApiRequestBodySchema>): ApiRequestInput {
  return {
    method: parsed.method,
    url: parsed.url,
    ...(parsed.headers !== undefined ? { headers: parsed.headers } : {}),
    ...(parsed.body !== undefined ? { body: parsed.body } : {}),
    ...(parsed.body_type !== undefined ? { body_type: parsed.body_type } : {}),
    ...(parsed.params !== undefined ? { params: parsed.params } : {}),
    ...(parsed.timeout_ms !== undefined ? { timeout_ms: parsed.timeout_ms } : {})
  };
}

export function registerApiRequestRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>
): void {
  fastify.post("/api-request", async (request, reply) => {
    const parsed = ApiRequestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new ValidationError(`Invalid api_request body — ${details}`);
    }

    const context = await playwrightRequest.newContext();
    try {
      const result = await executeApiRequest(context, toApiRequestInput(parsed.data));
      return reply.send(result);
    } finally {
      await context.dispose();
    }
  });
}

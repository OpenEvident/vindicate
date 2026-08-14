/**
 * @file GET console/network logs for a session (BROWSER-SERVICE §6.2).
 */
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { SessionNotFoundError, ValidationError } from "../../../shared/errors/worker.errors.js";
import type { SessionActionLog } from "../logs/action-log.js";
import type { SessionLogRegistry } from "../logs/session-log-registry.js";
import type { ISessionStore } from "../session/session.store.interface.js";

const ConsoleQuerySchema = z.object({
  since_snapshot_id: z.coerce.number().int().nonnegative().optional(),
  level: z.enum(["log", "info", "warn", "error", "debug"]).optional(),
  limit: z.coerce.number().int().positive().optional()
});

const NetworkQuerySchema = z.object({
  since_snapshot_id: z.coerce.number().int().nonnegative().optional(),
  status_min: z.coerce.number().int().optional(),
  url_contains: z.string().optional(),
  limit: z.coerce.number().int().positive().optional()
});

const ActionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional()
});

export interface LogRouteDeps {
  readonly store: ISessionStore;
  readonly logs: SessionLogRegistry;
  readonly actionLog: SessionActionLog;
}

export function registerLogRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  deps: LogRouteDeps
): void {
  fastify.get<{ Params: { id: string } }>("/sessions/:id/console_logs", async (request, reply) => {
    const { id } = request.params;
    if (deps.store.get(id) === undefined) {
      throw new SessionNotFoundError(id);
    }
    const parsed = ConsoleQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid console_logs query");
    }
    const entries = deps.logs.queryConsole(id, {
      ...(parsed.data.since_snapshot_id !== undefined
        ? { since_snapshot_id: parsed.data.since_snapshot_id }
        : {}),
      ...(parsed.data.level !== undefined ? { level: parsed.data.level } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {})
    });
    return reply.send({ entries });
  });

  fastify.get<{ Params: { id: string } }>("/sessions/:id/network_logs", async (request, reply) => {
    const { id } = request.params;
    if (deps.store.get(id) === undefined) {
      throw new SessionNotFoundError(id);
    }
    const parsed = NetworkQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid network_logs query");
    }
    const entries = deps.logs.queryNetwork(id, {
      ...(parsed.data.since_snapshot_id !== undefined
        ? { since_snapshot_id: parsed.data.since_snapshot_id }
        : {}),
      ...(parsed.data.status_min !== undefined ? { status_min: parsed.data.status_min } : {}),
      ...(parsed.data.url_contains !== undefined ? { url_contains: parsed.data.url_contains } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {})
    });
    return reply.send({ entries });
  });

  fastify.get<{ Params: { id: string } }>("/sessions/:id/actions", async (request, reply) => {
    const { id } = request.params;
    if (deps.store.get(id) === undefined) {
      throw new SessionNotFoundError(id);
    }
    const parsed = ActionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid actions query");
    }
    const entries = deps.actionLog.query(id, {
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {})
    });
    return reply.send({ entries });
  });
}

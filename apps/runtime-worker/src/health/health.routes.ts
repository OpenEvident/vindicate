/**
 * @file Liveness, readiness, and graceful shutdown routes.
 */
import { statfs } from "node:fs/promises";

import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PROTOCOL_VERSION } from "@vindicate/protocol";

import { getWorkerPackageVersion } from "../core/build-metadata.js";
import { isShuttingDown, requestGracefulShutdown, type ShutdownDeps } from "../core/shutdown.js";

const DISK_DEGRADED_MB = 500;

export interface HealthRouteDeps {
  readonly isReady: () => boolean;
  readonly sessionsDir: string;
  readonly getShutdownDeps?: () => ShutdownDeps;
  /** Notified on every /health hit — the idle-shutdown monitor's liveness signal. */
  readonly onHealthPing?: () => void;
}

async function diskFreeMb(dir: string): Promise<number | undefined> {
  try {
    const stats = await statfs(dir);
    const freeBytes = stats.bfree * stats.bsize;
    return Math.floor(freeBytes / (1024 * 1024));
  } catch {
    return undefined;
  }
}

export function registerHealthRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  deps: HealthRouteDeps
): void {
  fastify.get("/health", async (_request, reply) => {
    deps.onHealthPing?.();
    const disk_free_mb = await diskFreeMb(deps.sessionsDir);
    const degraded = disk_free_mb !== undefined && disk_free_mb < DISK_DEGRADED_MB;

    return reply.send({
      ok: true as const,
      service: "runtime-worker",
      version: getWorkerPackageVersion(),
      protocolVersion: PROTOCOL_VERSION,
      status: degraded ? ("degraded" as const) : ("ok" as const),
      ...(disk_free_mb !== undefined ? { disk_free_mb } : {})
    });
  });

  fastify.get("/ready", (_request, reply) => {
    if (isShuttingDown()) {
      return reply.status(503).send({ ready: false, reason: "shutting_down" });
    }
    if (!deps.isReady()) {
      return reply.status(503).send({ ready: false, reason: "initialising" });
    }
    return reply.send({ ready: true });
  });

  fastify.post("/shutdown", (_request, reply) => {
    const shutdownDeps = deps.getShutdownDeps?.();
    if (shutdownDeps === undefined) {
      return reply.status(503).send({ ok: false, error: "Shutdown not configured" });
    }
    void reply.status(200).send({ ok: true, shutting_down: true });
    requestGracefulShutdown(shutdownDeps);
  });
}

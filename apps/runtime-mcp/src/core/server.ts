/**
 * @file Fastify HTTP server for MCP health/shutdown endpoints (not the MCP protocol).
 */
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { Logger } from "@vindicate/observability";

import type { IWorkerClient } from "../worker/worker-client.interface.js";
import { isShuttingDown, requestGracefulShutdown, type ShutdownDeps } from "./shutdown.js";

function formatCircuitState(value: unknown): string {
  return typeof value === "string" ? value : "unknown";
}

export interface BuildServerOptions {
  readonly logger: Logger;
  readonly workerClient: IWorkerClient;
  readonly getShutdownDeps: () => ShutdownDeps;
  readonly startedAt: number;
}

export async function buildServer(options: BuildServerOptions) {
  const fastify = Fastify({
    loggerInstance: options.logger,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true
  });

  await fastify.register(sensible);
  await fastify.register(cors, { origin: true });

  fastify.get("/health", async (_request, reply) => {
    const workerOk = await options.workerClient.health().then((h) => h.ok).catch(() => false);
    const workerCircuitState = formatCircuitState(
      "circuitState" in (options.workerClient as object)
        ? (options.workerClient as { circuitState?: unknown }).circuitState
        : undefined
    );
    return reply.send({
      status: workerOk ? "ok" : "degraded",
      worker_reachable: workerOk,
      worker_ready: options.workerClient.isWorkerReady(),
      worker_circuit_state: workerCircuitState,
      uptime_s: Math.floor((Date.now() - options.startedAt) / 1000)
    });
  });

  fastify.get("/ready", (_request, reply) => {
    if (isShuttingDown()) {
      return reply.status(503).send({ ready: false, reason: "shutting_down" });
    }
    if (!options.workerClient.isWorkerReady()) {
      return reply.status(503).send({ ready: false, reason: "worker_not_probed" });
    }
    return reply.send({ ready: true });
  });

  fastify.post("/shutdown", async (_request, reply) => {
    void requestGracefulShutdown(options.getShutdownDeps());
    return reply.send({ ok: true });
  });

  fastify.post("/worker-shutdown-imminent", async (_request, reply) => {
    options.workerClient.setWorkerShuttingDown(true);
    await new Promise((r) => setTimeout(r, 2_000));
    return reply.send({ ok: true });
  });

  return fastify;
}

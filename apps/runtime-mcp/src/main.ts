/**
 * @file Composition root — wires modules and starts HTTP + MCP servers.
 */
import { config } from "./core/config.js";
import { logger } from "./core/logger.js";
import { buildServer } from "./core/server.js";
import { ContentService } from "./content/content-service.js";
import { createMcpHttpSessionManager } from "./mcp/mcp-http-sessions.js";
import { WorkerClient } from "./worker/worker-client.js";
import { startWorkerHealthProbe } from "./worker/worker-health-probe.js";
import { startWorkerEventsSubscriber } from "./worker/worker-events-subscriber.js";
import type { ShutdownDeps } from "./core/shutdown.js";
import { requestGracefulShutdown } from "./core/shutdown.js";

async function main(): Promise<void> {
  const startedAt = Date.now();

  const workerClient = new WorkerClient({
    baseUrl: config.VINDICATE_WORKER_URL,
    internalKey: config.VINDICATE_INTERNAL_KEY,
    retryTimeoutMs: config.VINDICATE_WORKER_RETRY_TIMEOUT_MS,
    healthProbeMs: config.VINDICATE_WORKER_HEALTH_PROBE_MS
  });

  const mcpSessions = createMcpHttpSessionManager({
    config,
    workerClient,
    makeContentService: (projectRoot) => new ContentService({ projectRoot })
  });

  // eslint-disable-next-line prefer-const -- assigned after fastify is created
  let shutdownDeps!: ShutdownDeps;

  const fastify = await buildServer({
    logger,
    workerClient,
    startedAt,
    getShutdownDeps: () => shutdownDeps
  });

  let stopWorkerProbe: () => void = () => {};
  let stopWorkerEvents: () => void = () => {};

  shutdownDeps = {
    closeMcpSessions: () => mcpSessions.closeAll(),
    httpServer: fastify,
    stopWorkerProbe: () => {
      stopWorkerProbe();
      stopWorkerEvents();
    }
  };

  stopWorkerProbe = startWorkerHealthProbe(workerClient, config.VINDICATE_WORKER_HEALTH_PROBE_MS);
  stopWorkerEvents = startWorkerEventsSubscriber(workerClient);

  fastify.all("/mcp", async (request, reply) => {
    reply.hijack();
    await mcpSessions.handleRequest(request.raw, reply.raw, request.body ?? undefined);
  });

  await fastify.listen({ port: config.VINDICATE_MCP_PORT, host: "127.0.0.1" });
  logger.info({ port: config.VINDICATE_MCP_PORT }, "runtime-mcp listening");

  const shutdown = async (): Promise<void> => {
    await requestGracefulShutdown(shutdownDeps);
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}

// A long-running local daemon must not die silently: Node's default behavior
// kills the process on any unhandled rejection, which users see as the MCP
// port going "connection refused" mid-task. Log loudly and keep serving —
// request-level failures are already surfaced to their callers.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ err: reason }, "unhandled promise rejection (continuing)");
});
process.on("uncaughtException", (err: unknown) => {
  logger.fatal({ err }, "uncaught exception — exiting");
  process.exit(1);
});

main().catch((err: unknown) => {
  logger.error({ err }, "runtime-mcp failed to start");
  process.exit(1);
});

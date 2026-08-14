import { createVindicateLogger } from "@vindicate/observability";
import { describe, expect, it, vi } from "vitest";

import { buildServer } from "../../src/core/server.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

describe("MCP HTTP health routes", () => {
  it("GET /health returns shape", async () => {
    const worker = new FakeWorkerClient();
    worker.markWorkerReady();
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const startedAt = Date.now();

    const app = await buildServer({
      logger,
      workerClient: worker,
      startedAt,
      getShutdownDeps: () => ({
        closeMcpSessions: async () => undefined,
        httpServer: app
      })
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ worker_reachable: boolean; uptime_s: number }>();
    expect(body.worker_reachable).toBe(true);
    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
  });

  it("GET /ready is 503 until worker probed", async () => {
    const worker = new FakeWorkerClient();
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const app = await buildServer({
      logger,
      workerClient: worker,
      startedAt: Date.now(),
      getShutdownDeps: () => ({
        closeMcpSessions: async () => undefined,
        httpServer: app
      })
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
  });

  it("POST /shutdown returns 200", async () => {
    const worker = new FakeWorkerClient();
    worker.markWorkerReady();
    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const close = vi.fn(async () => undefined);
    const app = await buildServer({
      logger,
      workerClient: worker,
      startedAt: Date.now(),
      getShutdownDeps: () => ({
        closeMcpSessions: close,
        httpServer: app
      })
    });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/shutdown" });
    expect(res.statusCode).toBe(200);
  });
});

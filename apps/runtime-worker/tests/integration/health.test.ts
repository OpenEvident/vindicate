import { createVindicateLogger } from "@vindicate/observability";
import { RuntimeHealthResponseSchema } from "@vindicate/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { setShutdownRunnerForTests } from "../../src/core/shutdown.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";
import { BrowserQueueManager } from "../../src/services/browser/queue/browser.queue.js";
import { FakeBrowserBridge } from "../fakes/fake-browser-bridge.js";
import { FakeResourceGovernor } from "../fakes/fake-resource-governor.js";

describe("health routes", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    setShutdownRunnerForTests(undefined);
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  it("GET /health returns RuntimeHealthResponse fields and disk_free_mb", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(50);
    app = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 50,
      lifecycle: { isReady: () => true, sessionsDir: process.cwd() }
    });

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    const parsed = RuntimeHealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(typeof body.disk_free_mb).toBe("number");
    expect(["ok", "degraded"]).toContain(body.status);
  });

  it("GET /ready returns 503 before ready and 200 when ready", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(50);
    let ready = false;
    app = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 50,
      lifecycle: { isReady: () => ready, sessionsDir: process.cwd() }
    });

    const before = await app.inject({ method: "GET", url: "/ready" });
    expect(before.statusCode).toBe(503);
    expect(before.json()).toMatchObject({ ready: false, reason: "initialising" });

    ready = true;
    const after = await app.inject({ method: "GET", url: "/ready" });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({ ready: true });
  });

  it("POST /shutdown returns 200 and runs shutdown runner", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(50);
    const bridge = new FakeBrowserBridge();
    const governor = new FakeResourceGovernor();
    const queues = new BrowserQueueManager(governor);
    const shutdownRan = vi.fn(() => Promise.resolve());
    setShutdownRunnerForTests(shutdownRan);

    const appRef = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 50,
      lifecycle: {
        isReady: () => true,
        sessionsDir: process.cwd(),
        getShutdownDeps: () => ({
          queues,
          bridge,
          store: { flush: () => Promise.resolve() } as never,
          governor,
          closeApp: () => appRef.close(),
          stopSessionCleanup: () => undefined
        })
      }
    });
    app = appRef;

    const res = await app.inject({
      method: "POST",
      url: "/shutdown",
      headers: internalAuthHeaders()
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, shutting_down: true });

    await vi.waitFor(() => {
      expect(shutdownRan).toHaveBeenCalled();
    });
  });
});

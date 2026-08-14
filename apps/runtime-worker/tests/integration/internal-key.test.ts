import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";
import { config } from "../../src/core/config.js";

describe("internal-key middleware", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  it("returns 401 when header is missing", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    app = await buildServer({ logger, eventBus: new EventBus(10), eventsBufferSize: 10 });
    const res = await app.inject({ method: "GET", url: "/capabilities" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: "auth.key_invalid", ok: false });
  });

  it("returns 401 when header is wrong", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    app = await buildServer({ logger, eventBus: new EventBus(10), eventsBufferSize: 10 });
    const res = await app.inject({
      method: "GET",
      url: "/capabilities",
      headers: { "x-vindicate-internal-key": "wrong-key-wrong-key-wrong-key-wrong!!" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("allows protected routes with the correct key", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    app = await buildServer({ logger, eventBus: new EventBus(10), eventsBufferSize: 10 });
    const res = await app.inject({
      method: "GET",
      url: "/capabilities",
      headers: internalAuthHeaders()
    });
    expect(res.statusCode).toBe(200);
    expect(config.VINDICATE_INTERNAL_KEY.length).toBeGreaterThanOrEqual(32);
  });

  it("exempts GET /health and GET /ready without a key", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    app = await buildServer({
      logger,
      eventBus: new EventBus(10),
      eventsBufferSize: 10,
      lifecycle: { isReady: () => true, sessionsDir: process.cwd() }
    });
    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
  });
});

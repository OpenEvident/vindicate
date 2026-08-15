import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";

let app: Awaited<ReturnType<typeof buildServer>> | undefined;

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
});

async function start(): Promise<Awaited<ReturnType<typeof buildServer>>> {
  const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
  const eventBus = new EventBus(20);
  app = await buildServer({ logger, eventBus, eventsBufferSize: 20 });
  return app;
}

describe("POST /api-request", () => {
  it("rejects an invalid body before making any network call", async () => {
    const server = await start();
    const res = await server.inject({
      method: "POST",
      url: "/api-request",
      headers: internalAuthHeaders(),
      payload: { method: "NOPE", url: "https://example.com/" }
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("validation.invalid_params");
  });

  it("rejects a non-URL url", async () => {
    const server = await start();
    const res = await server.inject({
      method: "POST",
      url: "/api-request",
      headers: internalAuthHeaders(),
      payload: { method: "GET", url: "not-a-url" }
    });
    expect(res.statusCode).toBe(400);
  });

  // Unreachable-host failure path doesn't depend on any third-party service being up — it's
  // exercising our own DNS-failure handling against a domain that will never resolve — so this
  // stays in the default suite alongside the validation cases above.
  it("surfaces an unreachable host as api.request_failed, not a crash", async () => {
    const server = await start();
    const res = await server.inject({
      method: "POST",
      url: "/api-request",
      headers: internalAuthHeaders(),
      payload: {
        method: "GET",
        url: "https://this-host-should-not-resolve.invalid/",
        timeout_ms: 5000
      }
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("api.request_failed");
  });
});

// Opt-in only, same convention as tests/e2e/browser.smoke.test.ts: a live call to a real public
// demo API is a genuine end-to-end proof the route → handler → Playwright wiring works, but it
// doesn't belong in the default suite that runs concurrently with the rest of the monorepo's
// tests — a third-party service's own transient blips under that load shouldn't fail CI on every
// commit. Run with VINDICATE_RUN_LIVE_API_TESTS=1.
const runLive = process.env.VINDICATE_RUN_LIVE_API_TESTS === "1";

describe.skipIf(!runLive)("POST /api-request — live network", () => {
  it("makes a real GET request and returns the live response", async () => {
    const server = await start();
    const res = await server.inject({
      method: "POST",
      url: "/api-request",
      headers: internalAuthHeaders(),
      payload: { method: "GET", url: "https://jsonplaceholder.typicode.com/posts/1" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: number; body_json?: { id?: number } };
    expect(body.status).toBe(200);
    expect(body.body_json?.id).toBe(1);
  });
});

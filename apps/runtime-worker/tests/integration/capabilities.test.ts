import { createVindicateLogger } from "@vindicate/observability";
import { WorkerCapabilitiesResponseSchema } from "@vindicate/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../../src/core/server.js";
import { EventBus } from "../../src/core/events/event-bus.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";

describe("GET /capabilities", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  it("returns browser actions and file operations", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(20);
    app = await buildServer({ logger, eventBus, eventsBufferSize: 20 });

    const res = await app.inject({
      method: "GET",
      url: "/capabilities",
      headers: internalAuthHeaders()
    });
    expect(res.statusCode).toBe(200);
    const body = WorkerCapabilitiesResponseSchema.parse(JSON.parse(res.body) as unknown);
    expect(body.browser.actions).toContain("snapshot");
    expect(body.browser.actions).toContain("pause_for_human");
    expect(body.browser.actions).toContain("upload_file");
    expect(body.browser.actions).toContain("resolve_target");
    expect(body.browser.actions).toContain("assert");
    expect(body.browser.coming_soon).toEqual([]);
    expect(body.files.operations).toContain("read");
  });
});

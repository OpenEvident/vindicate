import { createVindicateLogger } from "@vindicate/observability";
import { describe, expect, it } from "vitest";

import { EventBus } from "../../src/core/events/event-bus.js";
import { buildServer } from "../../src/core/server.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";

describe("GET /events validation", () => {
  it("rejects invalid since query", async () => {
    const logger = createVindicateLogger({ service: "runtime-worker-test", level: "silent" });
    const eventBus = new EventBus(10);
    const app = await buildServer({
      logger,
      eventBus,
      eventsBufferSize: 10
    });
    const res = await app.inject({
      method: "GET",
      url: "/events?since=not-a-number",
      headers: internalAuthHeaders()
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "validation.invalid_params" });
  });
});

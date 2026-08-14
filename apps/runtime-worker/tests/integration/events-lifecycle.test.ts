import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authInject,
  createBrowserSessionTestContext,
  createSession,
  destroyBrowserSessionTestContext,
  type BrowserSessionTestContext
} from "./browser.session.harness.js";
import { internalAuthHeaders } from "../helpers/auth-headers.js";

describe("session lifecycle SSE events", () => {
  let ctx: BrowserSessionTestContext;

  beforeEach(async () => {
    ctx = await createBrowserSessionTestContext();
  });

  afterEach(async () => {
    await destroyBrowserSessionTestContext(ctx);
  });

  it("emits session_paused, session_resumed_from_pause, and session_dead on the event bus", async () => {
    const sessionId = await createSession(ctx, "lifecycle");

    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      headers: internalAuthHeaders(),
      payload: { steps: [{ action: "pause_for_human", message: "CAPTCHA" }] }
    });

    let events = ctx.eventBus.getBuffered(0).map((e) => e.payload) as Array<{
      event?: string;
      session_id?: string;
    }>;
    expect(events.some((e) => e.event === "session_paused" && e.session_id === sessionId)).toBe(true);

    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume_from_pause`,
      headers: internalAuthHeaders()
    });

    events = ctx.eventBus.getBuffered(0).map((e) => e.payload);
    expect(
      events.some((e) => e.event === "session_resumed_from_pause" && e.session_id === sessionId)
    ).toBe(true);

    ctx.bridge.simulateContextDead(sessionId, "test_crash");

    await vi.waitFor(() => {
      const deadEvents = ctx.eventBus.getBuffered(0).map((e) => e.payload) as Array<{
        event?: string;
        session_id?: string;
      }>;
      expect(deadEvents.some((e) => e.event === "session_dead" && e.session_id === sessionId)).toBe(
        true
      );
      expect(ctx.store.get(sessionId)?.status).toBe("dead");
    });
  });
});

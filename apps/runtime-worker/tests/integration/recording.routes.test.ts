import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authInject,
  createBrowserSessionTestContext,
  createSession,
  destroyBrowserSessionTestContext,
  type BrowserSessionTestContext
} from "./browser.session.harness.js";

describe("Recording routes", () => {
  let ctx: BrowserSessionTestContext;

  beforeEach(async () => {
    ctx = await createBrowserSessionTestContext();
  });

  afterEach(async () => {
    await destroyBrowserSessionTestContext(ctx);
  });

  it("starts recording, publishes recording_started, stops, finalizes artifact", async () => {
    const sessionId = await createSession(ctx, "recording-test");
    const events: Array<Record<string, unknown>> = [];
    const unsub = ctx.eventBus.subscribe((entry) => {
      events.push(entry.payload);
    });

    const start = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Login Flow" }
    });
    if (start.statusCode !== 200) {
      throw new Error(`start failed: ${start.statusCode} ${String(start.body)}`);
    }
    expect(start.statusCode).toBe(200);
    expect(events.some((e) => e["event"] === "recording_started")).toBe(true);

    const stop = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/stop`
    });
    expect(stop.statusCode).toBe(200);
    expect(ctx.store.get(sessionId)?.status).toBe("paused");
    expect(events.some((e) => e["event"] === "recording_stopped")).toBe(true);

    const finalize = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/finalize`,
      payload: { steps: [] }
    });
    expect(finalize.statusCode).toBe(200);
    const body = JSON.parse(finalize.body) as { path: string };
    expect(body.path).toContain("Login-Flow.json");

    const artifact = JSON.parse(
      await readFile(path.join(ctx.dataDir, body.path), "utf-8")
    ) as {
      name: string;
      status: string;
    };
    expect(artifact.name).toBe("Login Flow");
    expect(artifact.status).toBe("finalized");
    expect(events.some((e) => e["event"] === "recording_finalized")).toBe(true);

    unsub();
  });

  it("records a manual snapshot step while recording", async () => {
    const sessionId = await createSession(ctx, "recording-snapshot");
    const events: Array<Record<string, unknown>> = [];
    const unsub = ctx.eventBus.subscribe((entry) => {
      events.push(entry.payload);
    });

    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Snapshot Flow" }
    });

    const snapshot = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/snapshot`
    });
    expect(snapshot.statusCode).toBe(200);

    const stepEvents = events.filter((e) => e["event"] === "recording_step");
    expect(
      stepEvents.some((e) => (e["step"] as { action?: string } | undefined)?.action === "snapshot")
    ).toBe(true);

    unsub();
  });

  it("refinalizes an existing artifact when the in-memory session is gone", async () => {
    const sessionId = await createSession(ctx, "recording-refinalize");
    const events: Array<Record<string, unknown>> = [];
    const unsub = ctx.eventBus.subscribe((entry) => {
      events.push(entry.payload);
    });

    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Checkout Flow" }
    });
    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/stop`
    });
    const finalize = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/finalize`,
      payload: { steps: [] }
    });
    expect(finalize.statusCode).toBe(200);

    const refinalize = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/recordings/Checkout-Flow/refinalize?project_root=${encodeURIComponent(ctx.dataDir)}`,
      payload: {
        steps: [
          {
            seq: 1,
            action: "navigate",
            timestamp: new Date().toISOString(),
            url: "https://example.com/checkout",
            candidates: [],
            chosen: null
          }
        ],
        summary: "Updated checkout flow"
      }
    });
    expect(refinalize.statusCode).toBe(200);

    const artifact = JSON.parse(
      await readFile(path.join(ctx.dataDir, ".vindicate", "recordings", "Checkout-Flow.json"), "utf-8")
    ) as { summary: string; steps: Array<{ url?: string }> };
    expect(artifact.summary).toBe("Updated checkout flow");
    expect(artifact.steps[0]?.url).toBe("https://example.com/checkout");
    expect(events.some((e) => e["event"] === "recording_finalized")).toBe(true);

    unsub();
  });

  it("deletes a finalized artifact without an active session", async () => {
    const sessionId = await createSession(ctx, "recording-delete");
    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Delete Me Flow" }
    });
    await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/stop`
    });
    const finalize = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/finalize`,
      payload: { steps: [] }
    });
    expect(finalize.statusCode).toBe(200);

    const del = await authInject(ctx.app, {
      method: "DELETE",
      url: `/browser/recordings/Delete-Me-Flow?project_root=${encodeURIComponent(ctx.dataDir)}`
    });
    expect(del.statusCode).toBe(200);

    const missing = await authInject(ctx.app, {
      method: "GET",
      url: `/browser/recordings/Delete-Me-Flow?project_root=${encodeURIComponent(ctx.dataDir)}`
    });
    expect(missing.statusCode).toBe(404);
  });

  it("returns 404 when session is missing", async () => {
    const missing = "00000000-0000-4000-8000-000000000099";
    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${missing}/recording/start`,
      payload: { name: "Missing" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when session is not active", async () => {
    const sessionId = await createSession(ctx, "paused-test");
    await ctx.store.applyTrigger(sessionId, "pause");
    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Paused" }
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "session_not_active" });
  });

  it("skip_entry_navigate omits the entry navigate step when pre-conditions were replayed", async () => {
    const sessionId = await createSession(ctx, "precondition-start");
    const events: Array<Record<string, unknown>> = [];
    const unsub = ctx.eventBus.subscribe((entry) => {
      events.push(entry.payload);
    });

    const start = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Checkout Flow", skip_entry_navigate: true }
    });
    expect(start.statusCode).toBe(200);
    expect(events.some((e) => e["event"] === "recording_started")).toBe(true);
    expect(events.some((e) => e["event"] === "recording_step")).toBe(false);

    const state = await authInject(ctx.app, {
      method: "GET",
      url: `/browser/sessions/${sessionId}/recording/state`
    });
    expect(state.statusCode).toBe(200);
    const body = JSON.parse(state.body) as {
      status: string;
      steps: Array<{ action: string; navigation_trigger?: string }>;
    };
    expect(body.status).toBe("recording");
    expect(body.steps).toEqual([]);

    unsub();
  });

  it("records an explicit entry navigate without skip_entry_navigate", async () => {
    const sessionId = await createSession(ctx, "normal-start");
    const events: Array<Record<string, unknown>> = [];
    const unsub = ctx.eventBus.subscribe((entry) => {
      events.push(entry.payload);
    });

    const start = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/recording/start`,
      payload: { name: "Login Flow" }
    });
    expect(start.statusCode).toBe(200);
    expect(events.some((e) => e["event"] === "recording_step")).toBe(true);

    const state = await authInject(ctx.app, {
      method: "GET",
      url: `/browser/sessions/${sessionId}/recording/state`
    });
    expect(state.statusCode).toBe(200);
    const body = JSON.parse(state.body) as {
      steps: Array<{ action: string; navigation_trigger?: string }>;
    };
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0]).toMatchObject({
      action: "navigate",
      navigation_trigger: "explicit"
    });

    unsub();
  });
});

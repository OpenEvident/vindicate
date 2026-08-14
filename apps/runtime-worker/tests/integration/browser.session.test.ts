import type { BrowserContext, Page } from "playwright-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authInject,
  createBrowserSessionTestContext,
  createSession,
  destroyBrowserSessionTestContext,
  parseSseDataLines,
  type BrowserSessionTestContext
} from "./browser.session.harness.js";

describe("Browser sessions HTTP", () => {
  let ctx: BrowserSessionTestContext;

  beforeEach(async () => {
    ctx = await createBrowserSessionTestContext();
  });

  afterEach(async () => {
    await destroyBrowserSessionTestContext(ctx);
  });

  it("creates, lists, runs commands via SSE, records actions, and deletes a session", async () => {
    const sessionId = await createSession(ctx, "integration");
    expect(ctx.bridge.getLastGotoUrl(sessionId)).toBe("https://example.com/");

    const listed = await authInject(ctx.app, { method: "GET", url: "/browser/sessions" });
    expect(listed.statusCode).toBe(200);
    const listJson = JSON.parse(listed.body) as Array<{ session_id: string }>;
    expect(listJson.some((s) => s.session_id === sessionId)).toBe(true);

    const cmd = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: {
        steps: [
          { action: "navigate", url: "https://example.com/" },
          { action: "clear_cookies", url: "https://example.com/" },
          { action: "snapshot" }
        ]
      }
    });
    expect(cmd.statusCode).toBe(200);
    const kinds = parseSseDataLines(cmd.body).map((e) => (e as { event?: string }).event);
    expect(kinds).toContain("accepted");
    expect(kinds).toContain("action_result");
    expect(kinds).toContain("completed");

    const navigateOnly = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "navigate", url: "https://example.com/about" }] }
    });
    const navigateEvents = parseSseDataLines(navigateOnly.body).map((e) => (e as { event?: string }).event);
    expect(navigateEvents).not.toContain("action_result");

    const actions = await authInject(ctx.app, { method: "GET", url: `/browser/sessions/${sessionId}/actions` });
    const actionEntries = (JSON.parse(actions.body) as { entries: Array<{ action: string }> }).entries;
    expect(actionEntries.some((e) => e.action === "navigate")).toBe(true);

    const del = await authInject(ctx.app, { method: "DELETE", url: `/browser/sessions/${sessionId}` });
    expect(del.statusCode).toBe(200);
  });

  it("returns 404 for unknown session", async () => {
    const missing = "00000000-0000-4000-8000-000000000099";
    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${missing}/commands`,
      payload: { steps: [{ action: "snapshot" }] }
    });
    expect(res.statusCode).toBe(404);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("session.not_found");
  });

  it("returns 410 when session is dead", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "crash");

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "snapshot" }] }
    });
    expect(res.statusCode).toBe(410);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("session.dead");
  });

  it("returns 409 when session is paused", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "pause");

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "snapshot" }] }
    });
    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("session.paused");
  });

  it("returns 409 when session queue is busy", async () => {
    const sessionId = await createSession(ctx);
    const queue = ctx.queues.forSession(sessionId);
    queue.tryAcquireForSession(sessionId);

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "snapshot" }] }
    });
    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("session.busy");

    queue.release();
  });

  it("resumes a dead session", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "crash");

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume`,
      payload: {}
    });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as { status: string }).status).toBe("active");
    expect(ctx.store.get(sessionId)?.status).toBe("active");
  });

  it("pause_for_human and resume_from_pause without snapshot by default", async () => {
    const sessionId = await createSession(ctx);

    const paused = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "pause_for_human", message: "Sign in manually" }] }
    });
    expect(paused.statusCode).toBe(200);
    expect(ctx.store.get(sessionId)?.status).toBe("paused");

    const eventsBefore = ctx.eventBus.getBuffered(0).map((e) => e.payload) as Array<{ event?: string }>;
    expect(eventsBefore.some((e) => e.event === "session_paused")).toBe(true);

    const resumed = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume_from_pause`
    });
    expect(resumed.statusCode).toBe(200);
    const body = JSON.parse(resumed.body) as { status: string; snapshot?: unknown };
    expect(body.status).toBe("active");
    expect(body.snapshot).toBeUndefined();

    const eventsAfter = ctx.eventBus.getBuffered(0).map((e) => e.payload) as Array<{ event?: string }>;
    expect(eventsAfter.some((e) => e.event === "session_resumed_from_pause")).toBe(true);
  });

  it("resume_from_pause with include_snapshot returns a snapshot", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "pause");

    const resumed = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume_from_pause?include_snapshot=true`
    });
    expect(resumed.statusCode).toBe(200);
    const body = JSON.parse(resumed.body) as { snapshot?: { snapshot_id: number } };
    expect(body.snapshot?.snapshot_id).toBeGreaterThan(0);
  });

  it("DELETE succeeds on a dead session", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "crash");

    const del = await authInject(ctx.app, { method: "DELETE", url: `/browser/sessions/${sessionId}` });
    expect(del.statusCode).toBe(200);
    expect(ctx.store.get(sessionId)).toBeUndefined();
  });

  it("returns 404 when resuming an expired session (removed from store)", async () => {
    const sessionId = await createSession(ctx);
    await ctx.store.applyTrigger(sessionId, "crash");
    await ctx.store.applyTrigger(sessionId, "ttl_elapsed");

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume`,
      payload: {}
    });
    expect(res.statusCode).toBe(404);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("session.not_found");
  });

  it("returns 429 when governor is in reject state", async () => {
    const sessionId = await createSession(ctx);
    ctx.governor.setState("reject");

    const res = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/commands`,
      payload: { steps: [{ action: "snapshot" }] }
    });
    expect(res.statusCode).toBe(429);
    expect((JSON.parse(res.body) as { code: string }).code).toBe("worker.throttled");
  });

  it("publishes session_dead when browser context is lost", async () => {
    const sessionId = await createSession(ctx);
    ctx.bridge.simulateContextDead(sessionId, "test_crash");

    await vi.waitFor(() => {
      const events = ctx.eventBus.getBuffered(0).map((e) => e.payload) as Array<{
        event?: string;
        session_id?: string;
      }>;
      expect(events.some((e) => e.event === "session_dead" && e.session_id === sessionId)).toBe(true);
      expect(ctx.store.get(sessionId)?.status).toBe("dead");
    });
  });

  it("resume_from_pause rolls back to dead when createContext fails", async () => {
    const sessionId = await createSession(ctx, "pause-resume");
    await ctx.store.applyTrigger(sessionId, "pause");
    await ctx.bridge.destroyContext(sessionId);
    ctx.bridge.failNextCreateContext(sessionId);

    const resumed = await authInject(ctx.app, {
      method: "POST",
      url: `/browser/sessions/${sessionId}/resume_from_pause`
    });
    expect(resumed.statusCode).toBe(500);

    const listed = await authInject(ctx.app, { method: "GET", url: "/browser/sessions" });
    const row = (JSON.parse(listed.body) as Array<{ session_id: string; status: string }>).find(
      (s) => s.session_id === sessionId
    );
    expect(row?.status).toBe("dead");
  });

  it("filters console and network logs", async () => {
    const sessionId = await createSession(ctx);

    const pageHandlers: Array<(page: Page) => void> = [];
    const context = {
      pages: (): Page[] => [],
      on: (_event: string, handler: (page: Page) => void): void => {
        pageHandlers.push(handler);
      }
    } as unknown as BrowserContext;
    ctx.sessionLogs.attachContext(sessionId, context);

    pageHandlers[0]?.({
      on: (event: string, handler: (msg: unknown) => void): void => {
        if (event === "console") {
          handler({ type: () => "error", text: () => "boom" });
          handler({ type: () => "log", text: () => "ok" });
        }
        if (event === "request") {
          handler({
            method: () => "GET",
            url: () => "https://example.com/api/data",
            resourceType: () => "fetch",
            response: () => Promise.resolve({ status: () => 404 })
          });
        }
      }
    } as unknown as Page);

    const consoleRes = await authInject(ctx.app, {
      method: "GET",
      url: `/browser/sessions/${sessionId}/console_logs?level=error`
    });
    const consoleEntries = (JSON.parse(consoleRes.body) as { entries: Array<{ level: string; message: string }> })
      .entries;
    expect(consoleEntries.some((e) => e.message === "boom")).toBe(true);
    expect(consoleEntries.every((e) => e.level === "error")).toBe(true);

    const networkRes = await authInject(ctx.app, {
      method: "GET",
      url: `/browser/sessions/${sessionId}/network_logs?status_min=400&url_contains=api`
    });
    const networkEntries = (JSON.parse(networkRes.body) as { entries: Array<{ status: number; url: string }> })
      .entries;
    expect(networkEntries.length).toBeGreaterThan(0);
    expect(networkEntries.every((e) => e.status >= 400 && e.url.includes("api"))).toBe(true);
  });
});

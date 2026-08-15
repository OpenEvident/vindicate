import { createVindicateLogger } from "@vindicate/observability";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserCrashError, BrowserUnavailableError } from "../../shared/errors/worker.errors.js";
import { PlaywrightBridge } from "./playwright-bridge.js";

const { launch, mockBrowser, mockContext } = vi.hoisted(() => {
  const mockContext = {
    pages: () => [],
    on: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
    addInitScript: vi.fn(() => Promise.resolve())
  };

  const mockBrowser = {
    on: vi.fn(),
    newContext: vi.fn(() => Promise.resolve(mockContext)),
    close: vi.fn(() => Promise.resolve())
  };

  return {
    mockContext,
    mockBrowser,
    launch: vi.fn(() => Promise.resolve(mockBrowser))
  };
});

vi.mock("playwright-core", () => ({
  chromium: {
    launch
  }
}));

describe("PlaywrightBridge", () => {
  beforeEach(() => {
    launch.mockClear();
    mockBrowser.on.mockClear();
    mockBrowser.newContext.mockClear();
    mockContext.close.mockClear();
  });

  it("creates an isolated context per session and reuses the browser pool", async () => {
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );

    const first = await bridge.createContext("sess-a", { headless: true });
    const second = await bridge.createContext("sess-b", { headless: true });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(bridge.hasContext("sess-a")).toBe(true);
    expect(bridge.hasContext("sess-b")).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
  });

  it("returns created:false when createContext is called for an existing session", async () => {
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );
    await bridge.createContext("sess-a", { headless: false });
    const again = await bridge.createContext("sess-a", { headless: false });
    expect(again.created).toBe(false);
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
  });

  it("throws BrowserCrashError when getContext is called without a session", () => {
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );
    expect(() => bridge.getContext("missing")).toThrow(BrowserCrashError);
  });

  it("emits onContextDead when the browser disconnects unexpectedly", async () => {
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );
    const dead: Array<{ sessionId: string; reason: string }> = [];
    bridge.onContextDead((sessionId, reason) => {
      dead.push({ sessionId, reason });
    });

    await bridge.createContext("sess-a", { headless: true });
    const disconnected = mockBrowser.on.mock.calls.find(
      ([event]) => event === "disconnected"
    )?.[1] as (() => void) | undefined;
    expect(typeof disconnected).toBe("function");
    disconnected?.();

    expect(dead).toEqual([{ sessionId: "sess-a", reason: "browser_disconnected" }]);
    expect(bridge.hasContext("sess-a")).toBe(false);
  });

  it("throws BrowserUnavailableError when Chrome launch fails", async () => {
    launch.mockRejectedValueOnce(new Error("chromium missing"));
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );
    await expect(bridge.createContext("sess-a")).rejects.toBeInstanceOf(BrowserUnavailableError);
  });

  it("destroyContext removes the session", async () => {
    const bridge = new PlaywrightBridge(
      createVindicateLogger({ service: "test", level: "silent" })
    );
    await bridge.createContext("sess-a", { headless: true });
    await bridge.destroyContext("sess-a");
    expect(bridge.hasContext("sess-a")).toBe(false);
    expect(mockContext.close).toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import { ProgressBridge } from "../../src/mcp/progress.js";

function collectMessages(
  bridge: ProgressBridge,
  run: (emit: (event: Record<string, unknown>) => void) => Promise<unknown>,
  progressToken?: string | number
): Promise<string[]> {
  const messages: string[] = [];
  return bridge
    .runWithProgress({
      sessionId: "s",
      ...(progressToken !== undefined ? { progressToken } : {}),
      run
    })
    .then(() => messages);
}

describe("ProgressBridge", () => {
  it("opens stream before run resolves", async () => {
    const notifications: unknown[] = [];
    const bridge = new ProgressBridge(async (n) => {
      notifications.push(n);
    });
    let runStarted = false;
    await bridge.runWithProgress({
      sessionId: "s",
      progressToken: "tok",
      totalSteps: 2,
      run: async (emit) => {
        runStarted = true;
        emit({ event: "step_started", step: 0, action: "navigate" });
        emit({ event: "step_completed", step: 0, duration_ms: 5 });
        return { ok: true };
      }
    });
    expect(bridge.subscriptionOpenedBeforeRun).toBe(true);
    expect(runStarted).toBe(true);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("maps step_progress and action_result", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    await bridge.runWithProgress({
      sessionId: "s",
      progressToken: 1,
      run: async (emit) => {
        emit({ event: "step_progress", message: "stdout line" });
        emit({ event: "action_result" });
        return Promise.resolve(null);
      }
    });
    expect(messages).toContain("stdout line");
    expect(messages).toContain("✓ Action complete");
  });

  it("emits Running notification for test_started", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    await collectMessages(
      bridge,
      (emit) => {
        emit({ event: "test_started", title: "login spec" });
        return Promise.resolve(null);
      },
      "tok"
    );
    expect(messages).toContain("Running: login spec");
  });

  it("emits checkmark for test_passed", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    await bridge.runWithProgress({
      sessionId: "s",
      progressToken: "tok",
      run: async (emit) => {
        emit({ event: "test_passed", title: "checkout" });
        return Promise.resolve(null);
      }
    });
    expect(messages).toContain("✓ checkout");
  });

  it("emits cross for test_failed", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    await bridge.runWithProgress({
      sessionId: "s",
      progressToken: "tok",
      run: async (emit) => {
        emit({ event: "test_failed", title: "flaky spec" });
        return Promise.resolve(null);
      }
    });
    expect(messages).toContain("✗ flaky spec");
  });

  it("includes action name in step_completed", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    await bridge.runWithProgress({
      sessionId: "s",
      progressToken: "tok",
      run: async (emit) => {
        emit({ event: "step_completed", step: 0, action: "snapshot", duration_ms: 12 });
        return Promise.resolve(null);
      }
    });
    expect(messages).toContain("✓ snapshot (12ms)");
  });

  it("survives a rejecting notifier without an unhandled rejection (disconnected client)", async () => {
    // When the MCP client disconnects mid-command, server.notification() rejects
    // for every subsequent step event. That rejection must be contained — an
    // unhandled rejection here kills the whole runtime-mcp process.
    const bridge = new ProgressBridge(async () => {
      throw new Error("Not connected");
    });
    const result = await bridge.runWithProgress({
      sessionId: "s",
      progressToken: "tok",
      run: async (emit) => {
        emit({ event: "step_started", step: 0, action: "click" });
        emit({ event: "step_completed", step: 0, action: "click", duration_ms: 3 });
        return { ok: true };
      }
    });
    // Let the fire-and-forget notification promises settle before the test ends
    // so any unhandled rejection would surface and fail this test.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result).toEqual({ ok: true });
  });

  it("sends no notifications when progressToken is undefined", async () => {
    const messages: string[] = [];
    const bridge = new ProgressBridge(async (n) => {
      if (n.message !== undefined) {
        messages.push(n.message);
      }
    });
    const result = await bridge.runWithProgress({
      sessionId: "s",
      run: async (emit) => {
        emit({ event: "test_started", title: "ignored" });
        return { ok: true };
      }
    });
    expect(result).toEqual({ ok: true });
    expect(messages).toHaveLength(0);
  });
});

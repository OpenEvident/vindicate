import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerManager } from "../../../src/extension/processes/WorkerManager";

describe("WorkerManager", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    show: vi.fn()
  };

  let extensionPath = "";
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    extensionPath = await mkdtemp(path.join(os.tmpdir(), "vindicate-ext-test-"));
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("attaches to an existing worker when health and capabilities succeed", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/health")) return { ok: true } as Response;
      if (href.includes("/capabilities")) return { ok: true } as Response;
      return { ok: false } as Response;
    });

    const manager = new WorkerManager(logger, extensionPath);
    await manager.start({ VINDICATE_INTERNAL_KEY: "a".repeat(32) });

    expect(manager.currentState).toBe("running");
    expect(manager.spawnedByExtension).toBe(false);
    await manager.stop();
    expect(manager.currentState).toBe("stopped");
  });

  it("rejects when an existing worker uses a different internal key", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/health")) return { ok: true } as Response;
      if (href.includes("/capabilities")) return { ok: false } as Response;
      return { ok: false } as Response;
    });

    const manager = new WorkerManager(logger, extensionPath);
    const outcome = await manager.start({ VINDICATE_INTERNAL_KEY: "b".repeat(32) }).then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error })
    );

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(String(outcome.error)).toContain("rejected the Vindicate internal key");
    }
    expect(manager.currentState).not.toBe("running");
  });

  it("throws when the runtime bundle is missing", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);

    const manager = new WorkerManager(logger, extensionPath);
    const outcome = await manager.start({ VINDICATE_INTERNAL_KEY: "c".repeat(32) }).then(
      () => ({ kind: "resolved" as const, state: manager.currentState }),
      (error: unknown) => ({ kind: "rejected" as const, error })
    );

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(String(outcome.error)).toContain("Runtime not built");
    }
  });

  it("attaches instead of failing when its own spawn lost a startup race to another editor", async () => {
    // Simulates two editors launching at the same moment: both see the port
    // free and both attempt to spawn, but only one process can actually bind
    // it. Whichever manager loses (its own spawn dies before healthy) should
    // re-probe and attach to the winner rather than surfacing a hard failure.
    let anotherEditorWonTheRace = false;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/health")) return { ok: anotherEditorWonTheRace } as Response;
      if (href.includes("/capabilities")) return { ok: anotherEditorWonTheRace } as Response;
      return { ok: false } as Response;
    });

    const manager = new WorkerManager(logger, extensionPath);
    const key = "d".repeat(32);

    // Port is free (health down) and the bundle is missing in this temp dir,
    // so our own spawn attempt fails immediately — this manager "lost".
    await expect(manager.start({ VINDICATE_INTERNAL_KEY: key })).rejects.toThrow(
      "Runtime not built"
    );
    expect(manager.currentState).toBe("error");

    // The other editor's worker is now up and accepts the shared key.
    anotherEditorWonTheRace = true;

    await manager.waitUntilHealthy(2_000);

    expect(manager.currentState).toBe("running");
    expect(manager.spawnedByExtension).toBe(false);
  });
});

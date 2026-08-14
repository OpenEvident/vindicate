import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVindicateLogger } from "@vindicate/observability";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../../src/core/events/event-bus.js";
import { PlaintextSessionCrypto } from "../../src/infrastructure/crypto/session-crypto.js";
import { SessionDiskStore } from "../../src/infrastructure/persistence/session-disk-store.js";
import { WorkerThrottledError } from "../../src/shared/errors/worker.errors.js";
import { ElementNotFoundError } from "../../src/shared/errors/worker.errors.js";
import { executeCommandSteps } from "../../src/services/browser/commands/command-executor.js";
import { SessionActionLog } from "../../src/services/browser/logs/action-log.js";
import { SessionLogRegistry } from "../../src/services/browser/logs/session-log-registry.js";
import { BrowserSessionStore } from "../../src/services/browser/session/session.store.js";
import { HighlightService } from "../../src/services/browser/highlight/highlight-service.js";
import { SnapshotEngine } from "../../src/services/browser/snapshot/snapshot-engine.js";
import { SnapshotMemoryTable } from "../../src/services/browser/snapshot/snapshot-memory.js";
import type { ElementDescriptor } from "../../src/services/browser/snapshot/element-descriptor.js";
import { FakeBrowserBridge } from "../fakes/fake-browser-bridge.js";
import { FakeResourceGovernor } from "../fakes/fake-resource-governor.js";

const commandConfig = {
  VINDICATE_SETTLE_NETWORK_MS: 100,
  VINDICATE_SETTLE_TIMEOUT_MS: 500,
  VINDICATE_ACTION_TIMEOUT_MS: 5_000,
  VINDICATE_ACTION_TIMEOUT_MAX_MS: 120_000
} as const;

describe("executeCommandSteps", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function createDeps(governor = new FakeResourceGovernor()) {
    const dir = path.join(os.tmpdir(), `vindicate-cmd-${Date.now()}-${Math.random()}`);
    await mkdir(dir, { recursive: true });
    tempDirs.push(dir);

    const logger = createVindicateLogger({ service: "test", level: "silent" });
    const disk = new SessionDiskStore(dir, new PlaintextSessionCrypto(), { encryptFilenames: false });
    const store = new BrowserSessionStore(disk, logger, 24);
    const bridge = new FakeBrowserBridge();
    const sessionLogs = new SessionLogRegistry({ consoleBufferSize: 20, networkBufferSize: 20 });
    const actionLog = new SessionActionLog(50);
    const eventBus = new EventBus(20);
    const snapshotEngine = new SnapshotEngine(
      new SnapshotMemoryTable(5),
      {
        VINDICATE_SNAPSHOT_MAX_NODES: 100,
        VINDICATE_SNAPSHOT_MAX_HTML_BYTES: 10_000,
        VINDICATE_MAX_OUTPUT_CHARS: 10_000,
        VINDICATE_SNAPSHOT_DESCRIPTOR_CAP: 2_000,
        VINDICATE_READ_SETTLE_MS: 700
      },
      () => {}
    );

    const rec = await store.create({
      name: "t",
      url: "https://example.com/",
      project_root: dir
    });
    await bridge.createContext(rec.session_id);

    return {
      deps: {
        bridge,
        snapshotEngine,
        highlightService: new HighlightService(),
        store,
        eventBus,
        governor,
        sessionLogs,
        actionLog,
        config: commandConfig
      },
      sessionId: rec.session_id
    };
  }

  it("throws WorkerThrottledError when governor is in reject state", async () => {
    const governor = new FakeResourceGovernor();
    governor.setState("reject");
    const { deps, sessionId } = await createDeps(governor);

    await expect(
      executeCommandSteps(deps, sessionId, [{ action: "navigate", url: "https://example.com/" }], () => {})
    ).rejects.toBeInstanceOf(WorkerThrottledError);
  });

  it("rejects invalid navigate steps", async () => {
    const { deps, sessionId } = await createDeps();
    const events: unknown[] = [];

    const result = await executeCommandSteps(deps, sessionId, [{ action: "navigate" }], (e) => {
      events.push(e);
    });

    expect(result.streamFailed).toBe(true);
    expect(events.some((e) => (e as { code?: string }).code === "validation.invalid_params")).toBe(true);
  });

  it("executes navigate and emits step lifecycle events", async () => {
    const { deps, sessionId } = await createDeps();
    const events: unknown[] = [];

    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "navigate", url: "https://example.com/page" }],
      (e) => {
        events.push(e);
      }
    );

    expect(result.streamFailed).toBe(false);
    expect(result.stepResults).toHaveLength(1);
    expect(events.map((e) => (e as { event?: string }).event)).toContain("step_started");
    expect(events.map((e) => (e as { event?: string }).event)).toContain("step_completed");
  });

  it("does not add round-trip metadata for click when trail has a single URL", async () => {
    const { deps, sessionId } = await createDeps();
    deps.snapshotEngine.getDescriptor = (_sessionId: string, ref: string) =>
      ref === "ref-00000001"
        ? {
            testidAttr: "data-testid",
            tag: "button",
            role: "button",
            name: "Submit",
            context: "main",
            snapshotUrl: "https://example.com/",
            locator: {
              strategy: "testid",
              confidence: "high",
              attr: "data-testid",
              value: "submit"
            }
          }
        : undefined;
    const result = await executeCommandSteps(deps, sessionId, [{ action: "click", ref: "ref-00000001" }], () => {});

    expect(result.streamFailed).toBe(false);
    expect(result.stepResults[0]).toMatchObject({
      action: "click",
      ok: true
    });
    expect(result.stepResults[0]).not.toHaveProperty("page_change");
    expect(result.stepResults[0]).not.toHaveProperty("url_trail");
  });

  it("pause_for_human pauses the session and publishes session_paused", async () => {
    const { deps, sessionId } = await createDeps();
    const events: unknown[] = [];

    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "pause_for_human", message: "confirm" }],
      (e) => {
        events.push(e);
      }
    );

    expect(result.streamFailed).toBe(false);
    expect(deps.store.get(sessionId)?.status).toBe("paused");
    const busEvents = deps.eventBus.getBuffered(0).map((e) => e.payload);
    expect(busEvents.some((e) => e.event === "session_paused")).toBe(true);
  });

  it("resolve_target respects scope when provided", async () => {
    const { deps, sessionId } = await createDeps();
    const descriptors = new Map<string, ElementDescriptor>([
      [
        "ref-00000001",
        { testidAttr: "data-testid", tag: "button", role: "button", name: "Save", context: "main", snapshotUrl: "https://example.com/" }
      ],
      [
        "ref-00000002",
        { testidAttr: "data-testid", tag: "button", role: "button", name: "Save", context: "nav", snapshotUrl: "https://example.com/" }
      ]
    ]);
    deps.snapshotEngine.getAllDescriptors = () => descriptors;

    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "resolve_target", target: "Save", scope: "nav" }],
      () => {}
    );

    expect(result.streamFailed).toBe(false);
    expect(result.stepResults[0]).toMatchObject({ type: "found", ref: "ref-00000002" });
  });

  it("fails the stream for unsupported actions", async () => {
    const { deps, sessionId } = await createDeps();
    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "not_a_real_action" }],
      () => {}
    );
    expect(result.streamFailed).toBe(true);
    expect(result.failedAction).toBe("not_a_real_action");
  });

  it("screenshot returns base64 JPEG with url and title (viewport default)", async () => {
    const { deps, sessionId } = await createDeps();
    const result = await executeCommandSteps(deps, sessionId, [{ action: "screenshot" }], () => {});

    expect(result.streamFailed).toBe(false);
    const step = result.stepResults[0] as Record<string, unknown>;
    expect(typeof step.image_base64).toBe("string");
    expect((step.image_base64 as string).length).toBeGreaterThan(0);
    expect(step.mime).toBe("image/jpeg");
    expect(step.url).toBe("https://example.com/");
    expect(step.title).toBe("Example");
    expect(step.scope_applied).toBe("viewport");
  });

  it("screenshot full_page sets scope_applied", async () => {
    const { deps, sessionId } = await createDeps();
    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "screenshot", full_page: true }],
      () => {}
    );

    expect(result.streamFailed).toBe(false);
    expect((result.stepResults[0] as Record<string, unknown>).scope_applied).toBe("full_page");
  });

  it("screenshot element scope via ref uses descriptor", async () => {
    const { deps, sessionId } = await createDeps();
    deps.snapshotEngine.getDescriptor = (_sessionId: string, ref: string) => {
      if (ref === "ref-00000001") {
        return { testidAttr: "data-testid", tag: "button", role: "button", name: "Save", context: "main", testid: "save-btn", snapshotUrl: "https://example.com/", locator: { strategy: "testid", confidence: "high", attr: "data-testid", value: "save-btn" } };
      }
      return undefined;
    };

    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "screenshot", scope: { ref: "ref-00000001" } }],
      () => {}
    );

    expect(result.streamFailed).toBe(false);
    expect((result.stepResults[0] as Record<string, unknown>).scope_applied).toBe("ref:ref-00000001");
  });

  it("screenshot invalid ref fails with ElementNotFoundError", async () => {
    const { deps, sessionId } = await createDeps();
    const events: unknown[] = [];

    const result = await executeCommandSteps(
      deps,
      sessionId,
      [{ action: "screenshot", scope: { ref: "ref-00000001" } }],
      (e) => {
        events.push(e);
      }
    );

    expect(result.streamFailed).toBe(true);
    expect(result.failedAction).toBe("screenshot");
    expect(events.some((e) => (e as { code?: string }).code === new ElementNotFoundError("ref-00000001", "").code)).toBe(
      true
    );
  });

  // A real batch (steps.length > 1) — every browser_act call today sends a 1-element steps array, so
  // the loop body below this point had never actually been exercised at N>1 before browser_fill_form
  // started relying on it for real multi-field batches.
  describe("multi-step batches (N>1)", () => {
    function descriptorFor(name: string) {
      return {
        testidAttr: "data-testid",
        tag: "button",
        role: "button",
        name,
        context: "main",
        snapshotUrl: "https://example.com/",
        locator: { strategy: "testid" as const, confidence: "high" as const, attr: "data-testid", value: name }
      };
    }

    it("executes steps in order and returns one result per step when all succeed", async () => {
      const { deps, sessionId } = await createDeps();
      const byRef = new Map([
        ["ref-00000001", descriptorFor("a")],
        ["ref-00000002", descriptorFor("b")],
        ["ref-00000003", descriptorFor("c")]
      ]);
      deps.snapshotEngine.getDescriptor = (_sessionId: string, ref: string) => byRef.get(ref);

      const events: unknown[] = [];
      const result = await executeCommandSteps(
        deps,
        sessionId,
        [
          { action: "click", ref: "ref-00000001" },
          { action: "hover", ref: "ref-00000002" },
          { action: "click", ref: "ref-00000003" }
        ],
        (e) => events.push(e)
      );

      expect(result.streamFailed).toBe(false);
      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults.every((r) => (r as { ok?: boolean }).ok === true)).toBe(true);
      // step_started events fire in the same order the steps were given, proving sequential (not
      // reordered/parallel) execution.
      const startedSteps = events
        .filter((e) => (e as { event?: string }).event === "step_started")
        .map((e) => (e as { step: number }).step);
      expect(startedSteps).toEqual([0, 1, 2]);
    });

    it("stops at the first failure, preserving results for every step that already succeeded", async () => {
      const { deps, sessionId } = await createDeps();
      const byRef = new Map([
        ["ref-00000001", descriptorFor("a")],
        ["ref-00000002", descriptorFor("b")]
        // ref-00000003 has no descriptor on purpose — this is the step that fails.
      ]);
      deps.snapshotEngine.getDescriptor = (_sessionId: string, ref: string) => byRef.get(ref);

      const events: unknown[] = [];
      const result = await executeCommandSteps(
        deps,
        sessionId,
        [
          { action: "click", ref: "ref-00000001" },
          { action: "click", ref: "ref-00000002" },
          { action: "click", ref: "ref-00000003" },
          { action: "click", ref: "ref-00000001" } // must never run — proves the loop truly stops
        ],
        (e) => events.push(e)
      );

      expect(result.streamFailed).toBe(true);
      expect(result.failedStep).toBe(2);
      expect(result.failedAction).toBe("click");
      // Exactly the two steps before the failure completed — nothing from the failure onward, and
      // critically nothing from the 4th step either (it would silently corrupt this count if the loop
      // kept going after a failure instead of stopping).
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults.every((r) => (r as { ok?: boolean }).ok === true)).toBe(true);

      const startedSteps = events
        .filter((e) => (e as { event?: string }).event === "step_started")
        .map((e) => (e as { step: number }).step);
      expect(startedSteps).toEqual([0, 1, 2]);

      const failedEvent = events.find((e) => (e as { event?: string }).event === "failed") as
        | { step: number; action: string; error: string; code: string }
        | undefined;
      expect(failedEvent?.step).toBe(2);
      expect(failedEvent?.action).toBe("click");
    });

    it("fails on the very first step without executing any later ones", async () => {
      const { deps, sessionId } = await createDeps();
      deps.snapshotEngine.getDescriptor = () => undefined;

      const result = await executeCommandSteps(
        deps,
        sessionId,
        [
          { action: "click", ref: "ref-00000001" },
          { action: "click", ref: "ref-00000002" }
        ],
        () => {}
      );

      expect(result.streamFailed).toBe(true);
      expect(result.failedStep).toBe(0);
      expect(result.stepResults).toHaveLength(0);
    });
  });
});

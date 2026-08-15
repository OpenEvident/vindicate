import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import type { BrowserContext, Frame, Page } from "playwright-core";
import type { RecordingArtifact, StructuredLocator } from "@vindicate/protocol";

import { RecordingService } from "./recording.service.js";
import type { IBrowserBridge } from "../../../infrastructure/browser/browser-bridge.interface.js";
import type { RecordingEventSource } from "../../../infrastructure/browser/browser-bridge.types.js";
import type { IEventBus } from "../../../core/events/event-bus.interface.js";
import type { ISessionStore } from "../session/session.store.interface.js";
import { FilesOutsideRootError } from "../../../shared/errors/worker.errors.js";

type OnEvent = (
  payload: Record<string, unknown>,
  source: RecordingEventSource
) => void | Promise<void>;

function fakeLogger(): Logger {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

function fakeEventBus(): IEventBus {
  return {
    publish: vi.fn().mockReturnValue(1),
    subscribe: vi.fn().mockReturnValue(() => {}),
    getBuffered: vi.fn().mockReturnValue([]),
    getNextSeq: vi.fn().mockReturnValue(1),
    getOldestBufferedSeq: vi.fn().mockReturnValue(undefined)
  };
}

function fakeSessionStore(): ISessionStore {
  return {
    initializeFromDisk: vi.fn(),
    startPeriodicCleanup: vi.fn(),
    cleanup: vi.fn(),
    create: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
    abandon: vi.fn(),
    applyTrigger: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    flush: vi.fn()
  };
}

interface Harness {
  bridge: IBrowserBridge;
  getOnEvent: () => OnEvent;
  getPageOpenHandler: () => (page: Page) => void;
  tabState: { activePageIndex: number };
  mainPage: Page;
}

function fakePage(url: string): Page {
  return {
    url: () => url,
    title: vi.fn().mockResolvedValue("Title"),
    isClosed: () => false,
    bringToFront: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    once: vi.fn(),
    mainFrame: () => ({}) as Frame,
    frames: () => [],
    evaluate: vi
      .fn()
      .mockResolvedValue({ elements: [], truncated: false, collapsed_count: 0, alerts: [] })
  } as unknown as Page;
}

function makeHarness(pages: Page[] = [fakePage("https://app.test/")]): Harness {
  let onEvent: OnEvent = () => {};
  let pageOpenHandler: (page: Page) => void = () => {};
  const tabState = { activePageIndex: 0 };
  const openPages = [...pages];

  const context = {
    pages: () => openPages,
    on: (event: string, handler: (page: Page) => void) => {
      if (event === "page") {
        pageOpenHandler = handler;
      }
    }
  } as unknown as BrowserContext;

  const bridge: IBrowserBridge = {
    hasContext: vi.fn().mockReturnValue(true),
    createContext: vi.fn(),
    ensureHealthyContext: vi.fn(),
    destroyContext: vi.fn(),
    getContext: vi.fn().mockReturnValue(context),
    getTabState: vi.fn().mockReturnValue(tabState),
    getPage: vi.fn().mockImplementation(() => Promise.resolve(openPages[tabState.activePageIndex])),
    setupRecording: vi.fn().mockImplementation((_sessionId: string, cb: OnEvent) => {
      onEvent = cb;
      return Promise.resolve();
    }),
    injectScript: vi.fn().mockResolvedValue(undefined),
    onContextDead: vi.fn(),
    closeAll: vi.fn()
  };

  return {
    bridge,
    getOnEvent: () => onEvent,
    getPageOpenHandler: () => pageOpenHandler,
    tabState,
    mainPage: pages[0]!
  };
}

const settleCfg = { VINDICATE_SETTLE_NETWORK_MS: 10, VINDICATE_SETTLE_TIMEOUT_MS: 20 };

describe("RecordingService frame_path attachment", () => {
  it("attaches frame_path to candidates for a click event sourced from a nested frame", async () => {
    const harness = makeHarness();
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-1", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });

    const hostLocator: StructuredLocator = {
      strategy: "dom_id",
      confidence: "high",
      value: "klarna-checkout-iframe"
    };
    const iframeHandle = { evaluate: vi.fn().mockResolvedValue(hostLocator) };
    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) };
    const leafFrame = {
      parentFrame: vi.fn().mockReturnValue(mainFrame),
      frameElement: vi.fn().mockResolvedValue(iframeHandle)
    } as unknown as Frame;

    await harness.getOnEvent()(
      {
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [{ strategy: "dom_id", value: "submit-btn", strength: "strong" }],
        chosen: { strategy: "dom_id", value: "submit-btn", strength: "strong" },
        element: { tag: "button" }
      },
      { page: harness.mainPage, frame: leafFrame }
    );

    const state = service.getState("sess-1");
    expect(state?.steps).toHaveLength(1);
    expect(state?.steps[0]?.chosen?.frame_path).toEqual([hostLocator]);
    expect(state?.steps[0]?.candidates[0]?.frame_path).toEqual([hostLocator]);
  });

  it("omits frame_path for a top-frame event (no regression)", async () => {
    const harness = makeHarness();
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-2", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });

    const mainFrame = { parentFrame: vi.fn().mockReturnValue(null) } as unknown as Frame;

    await harness.getOnEvent()(
      {
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [{ strategy: "dom_id", value: "submit-btn", strength: "strong" }],
        chosen: { strategy: "dom_id", value: "submit-btn", strength: "strong" },
        element: { tag: "button" }
      },
      { page: harness.mainPage, frame: mainFrame }
    );

    const state = service.getState("sess-2");
    expect(state?.steps[0]?.chosen?.frame_path).toBeUndefined();
  });
});

const TOP_FRAME = { parentFrame: () => null } as unknown as Frame;

function clickPayload(name: string): Record<string, unknown> {
  return {
    action: "click",
    timestamp: "2026-06-20T00:00:00.000Z",
    candidates: [{ strategy: "dom_id", value: name, strength: "strong" }],
    chosen: { strategy: "dom_id", value: name, strength: "strong" },
    element: { tag: "button" }
  };
}

describe("RecordingService popup tracking (per-event page attribution)", () => {
  it("does not synthesize a switch step for the very first attributed event (baseline, not a switch)", async () => {
    const mainPage = fakePage("https://app.test/");
    const harness = makeHarness([mainPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-1", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });

    await harness.getOnEvent()(clickPayload("first-btn"), { page: mainPage, frame: TOP_FRAME });

    const state = service.getState("sess-1");
    expect(state?.steps).toHaveLength(1);
    expect(state?.steps[0]?.action).toBe("click");
  });

  it("synthesizes a switch_tab_by_url step when the open listener fires, even before any interaction inside the popup", async () => {
    const mainPage = fakePage("https://app.test/");
    const popupPage = fakePage("https://checkout.klarna.com/session/abc");
    const harness = makeHarness([mainPage, popupPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-2", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });
    await harness.getOnEvent()(clickPayload("first-btn"), { page: mainPage, frame: TOP_FRAME });

    harness.getPageOpenHandler()(popupPage);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.tabState.activePageIndex).toBe(1);
    const state = service.getState("sess-2");
    const switchStep = state?.steps.find((s) => s.action === "switch_tab_by_url");
    expect(switchStep?.url).toBe("https://checkout.klarna.com/session/abc");
    expect(switchStep?.navigation_trigger).toBe("implicit");
  });

  it("attributes a click that arrives on a popup page immediately, without ever waiting for the open listener (race fix)", async () => {
    // The open listener never fires in this test at all — proving attribution doesn't depend on it.
    const mainPage = fakePage("https://app.test/");
    const popupPage = fakePage("https://checkout.klarna.com/session/abc");
    const harness = makeHarness([mainPage, popupPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-3", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });
    await harness.getOnEvent()(clickPayload("open-popup-btn"), {
      page: mainPage,
      frame: TOP_FRAME
    });

    await harness.getOnEvent()(clickPayload("card-number-field"), {
      page: popupPage,
      frame: TOP_FRAME
    });

    expect(harness.tabState.activePageIndex).toBe(1);
    const state = service.getState("sess-3");
    const actions = state?.steps.map((s) => s.action);
    // The switch step must land BEFORE the click it's attributing, never after.
    expect(actions).toEqual(["click", "switch_tab_by_url", "click"]);
    expect(state?.steps[1]?.url).toBe("https://checkout.klarna.com/session/abc");
  });

  it("attributes a click back on the original page after the popup closes, with no explicit close handling", async () => {
    const mainPage = fakePage("https://app.test/");
    const popupPage = fakePage("https://checkout.klarna.com/session/abc");
    const harness = makeHarness([mainPage, popupPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-4", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });
    await harness.getOnEvent()(clickPayload("open-popup-btn"), {
      page: mainPage,
      frame: TOP_FRAME
    });
    await harness.getOnEvent()(clickPayload("pay-btn"), { page: popupPage, frame: TOP_FRAME });

    // Popup is never closed here — the human just refocuses the main page and clicks something.
    await harness.getOnEvent()(clickPayload("continue-btn"), { page: mainPage, frame: TOP_FRAME });

    expect(harness.tabState.activePageIndex).toBe(0);
    const state = service.getState("sess-4");
    const switchSteps = state?.steps.filter((s) => s.action === "switch_tab_by_url");
    expect(switchSteps).toHaveLength(2);
    expect(switchSteps?.[0]?.url).toBe("https://checkout.klarna.com/session/abc");
    expect(switchSteps?.[1]?.url).toBe("https://app.test/");
  });

  it("attributes correctly across two popups regardless of which one closes first (no explicit restore needed)", async () => {
    const mainPage = fakePage("https://app.test/");
    const popupA = fakePage("https://a.example.com/");
    const popupB = fakePage("https://b.example.com/");
    const harness = makeHarness([mainPage, popupA, popupB]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-5", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });
    await harness.getOnEvent()(clickPayload("open-a-btn"), { page: mainPage, frame: TOP_FRAME });

    await harness.getOnEvent()(clickPayload("a-field"), { page: popupA, frame: TOP_FRAME });
    await harness.getOnEvent()(clickPayload("b-field"), { page: popupB, frame: TOP_FRAME });
    // Popup A "closes" first (out of open order — B is more recent) with no explicit close signal at all;
    // the next real interaction is back on the main page.
    await harness.getOnEvent()(clickPayload("main-continue-btn"), {
      page: mainPage,
      frame: TOP_FRAME
    });

    expect(harness.tabState.activePageIndex).toBe(0);
    const state = service.getState("sess-5");
    const switchSteps = state?.steps
      .filter((s) => s.action === "switch_tab_by_url")
      .map((s) => s.url);
    expect(switchSteps).toEqual([
      "https://a.example.com/",
      "https://b.example.com/",
      "https://app.test/"
    ]);
  });

  it("does not attribute or sync tab state for agent-driven recordings (agent uses its own explicit tab actions)", async () => {
    const mainPage = fakePage("https://app.test/");
    const popupPage = fakePage("https://checkout.klarna.com/session/abc");
    const harness = makeHarness([mainPage, popupPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-6", "flow", "/tmp/project", {
      started_by: "agent",
      skip_entry_navigate: true
    });

    harness.getPageOpenHandler()(popupPage);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.tabState.activePageIndex).toBe(0);
    const state = service.getState("sess-6");
    expect(state?.steps.find((s) => s.action === "switch_tab_by_url")).toBeUndefined();
  });
});

describe("RecordingService pause-state broadcast", () => {
  it("pushes the paused state to every open page, not just the one that toggled it", async () => {
    const mainPage = fakePage("https://app.test/");
    const popupPage = fakePage("https://checkout.klarna.com/session/abc");
    const harness = makeHarness([mainPage, popupPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-7", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });

    await harness.getOnEvent()(
      { event: "__paused", paused: true },
      { page: popupPage, frame: TOP_FRAME }
    );

    const applyOn = (page: Page): unknown[] | undefined =>
      (page.evaluate as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "function" && String(call[0]).includes("__vindicateApplyPausedState")
      );

    expect(applyOn(mainPage)).toBeDefined();
    expect(applyOn(popupPage)).toBeDefined();
    expect(applyOn(mainPage)?.[1]).toBe(true);
    expect(applyOn(popupPage)?.[1]).toBe(true);
  });

  it("never calls __vindicateSetRecorderPaused for the broadcast (would re-emit and loop)", async () => {
    const mainPage = fakePage("https://app.test/");
    const harness = makeHarness([mainPage]);
    const service = new RecordingService(
      harness.bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
    await service.start("sess-8", "flow", "/tmp/project", {
      started_by: "human",
      skip_entry_navigate: true
    });

    await harness.getOnEvent()(
      { event: "__paused", paused: true },
      { page: mainPage, frame: TOP_FRAME }
    );

    const calls = (mainPage.evaluate as ReturnType<typeof vi.fn>).mock.calls;
    const usesSetter = calls.some(
      (call: unknown[]) =>
        typeof call[0] === "function" && String(call[0]).includes("__vindicateSetRecorderPaused")
    );
    expect(usesSetter).toBe(false);
  });
});

describe("RecordingService artifact path safety (path-injection guard)", () => {
  let projectRoot: string;
  let service: RecordingService;

  // Real recording names run through sanitizeRecordingName, which only strips the 9
  // Windows-invalid filename characters (< > : " / \ | ? *) and control chars — unicode
  // letters, dots, parens, and apostrophes all survive untouched and are in active use.
  const LEGIT_SAFE_NAMES = ["café-login", "v1.2-(smoke)", "user's-flow", "a-&-b-test"];
  const TRAVERSAL_SAFE_NAMES = [
    "../escape",
    "..\\escape",
    "../../../escape",
    "a/../../escape",
    ".."
  ];

  function makeArtifact(sessionId: string): RecordingArtifact {
    return {
      name: "flow",
      recorded_at: "2026-06-20T00:00:00.000Z",
      session_id: sessionId,
      project_root: projectRoot,
      status: "finalized",
      steps: []
    };
  }

  async function writeArtifact(safeName: string, sessionId: string): Promise<void> {
    const dir = path.join(projectRoot, ".vindicate", "recordings");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${safeName}.json`),
      JSON.stringify(makeArtifact(sessionId)),
      "utf-8"
    );
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), "vindicate-artifact-safety-"));
    service = new RecordingService(
      makeHarness().bridge,
      fakeSessionStore(),
      fakeEventBus(),
      fakeLogger(),
      settleCfg
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("deleteArtifact", () => {
    for (const safeName of LEGIT_SAFE_NAMES) {
      it(`deletes a legitimate artifact named "${safeName}" without throwing`, async () => {
        const sessionId = "00000000-0000-4000-8000-000000000001";
        await writeArtifact(safeName, sessionId);
        await expect(service.deleteArtifact(projectRoot, safeName)).resolves.toBeUndefined();
        const artifactPath = path.join(projectRoot, ".vindicate", "recordings", `${safeName}.json`);
        await expect(readFile(artifactPath, "utf-8")).rejects.toThrow();
      });
    }

    for (const safeName of TRAVERSAL_SAFE_NAMES) {
      it(`rejects a traversal attempt via safeName="${safeName}"`, async () => {
        // A sentinel file placed just outside recordingsDir — proves nothing outside the
        // recordings directory is ever touched, not just that the call throws.
        const sentinel = path.join(projectRoot, ".vindicate", "sentinel.json");
        await mkdir(path.dirname(sentinel), { recursive: true });
        await writeFile(sentinel, "untouched", "utf-8");

        await expect(service.deleteArtifact(projectRoot, safeName)).rejects.toBeInstanceOf(
          FilesOutsideRootError
        );
        await expect(readFile(sentinel, "utf-8")).resolves.toBe("untouched");
      });
    }
  });

  describe("refinalizeArtifact", () => {
    for (const safeName of LEGIT_SAFE_NAMES) {
      it(`refinalizes a legitimate artifact named "${safeName}"`, async () => {
        const sessionId = "00000000-0000-4000-8000-000000000002";
        await writeArtifact(safeName, sessionId);
        const result = await service.refinalizeArtifact(projectRoot, safeName);
        expect(result.safe_name).toBe(safeName);
      });
    }

    for (const safeName of TRAVERSAL_SAFE_NAMES) {
      it(`rejects a traversal attempt via safeName="${safeName}"`, async () => {
        await expect(service.refinalizeArtifact(projectRoot, safeName)).rejects.toBeInstanceOf(
          FilesOutsideRootError
        );
      });
    }
  });

  describe("annotateArtifact", () => {
    const fields = {
      pre_conditions: [],
      post_conditions: [],
      depends_on: [],
      summary: "updated"
    };

    for (const safeName of LEGIT_SAFE_NAMES) {
      it(`annotates a legitimate artifact named "${safeName}"`, async () => {
        const sessionId = "00000000-0000-4000-8000-000000000003";
        await writeArtifact(safeName, sessionId);
        await expect(
          service.annotateArtifact(projectRoot, safeName, fields)
        ).resolves.toBeUndefined();
        const artifactPath = path.join(projectRoot, ".vindicate", "recordings", `${safeName}.json`);
        const updated = JSON.parse(await readFile(artifactPath, "utf-8")) as RecordingArtifact;
        expect(updated.summary).toBe("updated");
      });
    }

    for (const safeName of TRAVERSAL_SAFE_NAMES) {
      it(`rejects a traversal attempt via safeName="${safeName}"`, async () => {
        await expect(
          service.annotateArtifact(projectRoot, safeName, fields)
        ).rejects.toBeInstanceOf(FilesOutsideRootError);
      });
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import type { RecordedStep } from "@vindicate/protocol";

import { playbackRecordingSteps } from "./recording-playback.service.js";

function fakePage(goto = vi.fn(async () => {})): Page {
  const page = {
    goto,
    isClosed: () => false,
    waitForLoadState: vi.fn(async () => {}),
    url: () => "https://example.test/current",
    locator: () =>
      ({
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
        selectOption: vi.fn(async () => {}),
        check: vi.fn(async () => {}),
        uncheck: vi.fn(async () => {}),
        hover: vi.fn(async () => {}),
        dblclick: vi.fn(async () => {})
      }) as unknown as ReturnType<Page["locator"]>,
    getByRole: () =>
      ({
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
        selectOption: vi.fn(async () => {}),
        check: vi.fn(async () => {}),
        uncheck: vi.fn(async () => {}),
        hover: vi.fn(async () => {}),
        dblclick: vi.fn(async () => {})
      }) as unknown as ReturnType<Page["getByRole"]>,
    getByLabel: () =>
      ({
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
        selectOption: vi.fn(async () => {}),
        check: vi.fn(async () => {}),
        uncheck: vi.fn(async () => {}),
        hover: vi.fn(async () => {}),
        dblclick: vi.fn(async () => {})
      }) as unknown as ReturnType<Page["getByLabel"]>,
    getByPlaceholder: () =>
      ({
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
        selectOption: vi.fn(async () => {}),
        check: vi.fn(async () => {}),
        uncheck: vi.fn(async () => {}),
        hover: vi.fn(async () => {}),
        dblclick: vi.fn(async () => {})
      }) as unknown as ReturnType<Page["getByPlaceholder"]>,
    getByText: () =>
      ({
        click: vi.fn(async () => {}),
        fill: vi.fn(async () => {}),
        selectOption: vi.fn(async () => {}),
        check: vi.fn(async () => {}),
        uncheck: vi.fn(async () => {}),
        hover: vi.fn(async () => {}),
        dblclick: vi.fn(async () => {})
      }) as unknown as ReturnType<Page["getByText"]>,
    keyboard: { press: vi.fn(async () => {}) },
    mouse: { wheel: vi.fn(async () => {}) }
  } as unknown as Page;
  (page as unknown as { context: () => unknown }).context = () => ({
    pages: () => [page]
  });
  return page;
}

const settleCfg = {
  VINDICATE_SETTLE_NETWORK_MS: 10,
  VINDICATE_SETTLE_TIMEOUT_MS: 20
};

describe("playbackRecordingSteps precondition filtering", () => {
  it("skips first explicit navigate and all implicit navigates", async () => {
    const goto = vi.fn(async () => {});
    const page = fakePage(goto);
    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "navigate",
        timestamp: "2026-06-20T00:00:00.000Z",
        url: "https://app.test/login",
        candidates: [],
        chosen: null,
        navigation_trigger: "explicit"
      },
      {
        seq: 2,
        action: "snapshot",
        timestamp: "2026-06-20T00:00:01.000Z",
        candidates: [],
        chosen: null
      },
      {
        seq: 3,
        action: "navigate",
        timestamp: "2026-06-20T00:00:02.000Z",
        url: "https://app.test/dashboard",
        candidates: [],
        chosen: null,
        navigation_trigger: "implicit"
      },
      {
        seq: 4,
        action: "navigate",
        timestamp: "2026-06-20T00:00:03.000Z",
        url: "https://app.test/settings",
        candidates: [],
        chosen: null,
        navigation_trigger: "explicit"
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledWith("https://app.test/settings", {
      waitUntil: "load",
      timeout: 1000
    });
  });

  it("treats first navigate without trigger as entry navigate and skips it", async () => {
    const goto = vi.fn(async () => {});
    const page = fakePage(goto);
    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "navigate",
        timestamp: "2026-06-20T00:00:00.000Z",
        url: "https://app.test/login",
        candidates: [],
        chosen: null
      },
      {
        seq: 2,
        action: "navigate",
        timestamp: "2026-06-20T00:00:01.000Z",
        url: "https://app.test/profile",
        candidates: [],
        chosen: null,
        navigation_trigger: "explicit"
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledWith("https://app.test/profile", {
      waitUntil: "load",
      timeout: 1000
    });
  });

  it("does not fail replay when a played navigate never reaches real network-idle (best-effort settle only)", async () => {
    // Regression guard: goto's hard condition is now `load`, which always fires. The extra network-idle
    // wait afterward (navigate is in SETTLE_ACTIONS) is best-effort — a site that never truly idles
    // (chat widgets, analytics, websockets) must not fail the whole replay the way a hard `waitUntil:
    // "networkidle"` goto previously did.
    const goto = vi.fn(async () => {});
    const page = fakePage(goto);
    const waitForLoadState = vi.fn().mockRejectedValue(new Error("Timeout 20ms exceeded"));
    (page as unknown as { waitForLoadState: typeof waitForLoadState }).waitForLoadState =
      waitForLoadState;
    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "navigate",
        timestamp: "2026-06-20T00:00:00.000Z",
        url: "https://app.test/login",
        candidates: [],
        chosen: null
      },
      {
        seq: 2,
        action: "navigate",
        timestamp: "2026-06-20T00:00:01.000Z",
        url: "https://app.test/checkout",
        candidates: [],
        chosen: null,
        navigation_trigger: "explicit"
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(goto).toHaveBeenCalledWith("https://app.test/checkout", {
      waitUntil: "load",
      timeout: 1000
    });
    expect(waitForLoadState).toHaveBeenCalledTimes(1);
    const [state, opts] = waitForLoadState.mock.calls[0] as [string, { timeout: number }];
    expect(state).toBe("networkidle");
    expect(typeof opts.timeout).toBe("number");
  });
});

describe("playbackRecordingSteps sibling_text candidate resolution", () => {
  it("resolves a chosen sibling_text candidate via its stored xpath, not a crash", async () => {
    const click = vi.fn(async () => {});
    const locator = vi.fn().mockReturnValue({ click });
    const xpath = '//button[preceding-sibling::*[normalize-space()="GAY EVENT"]]';
    const page = {
      ...fakePage(),
      locator,
      waitForLoadState: vi.fn(async () => {})
    } as unknown as Page;

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: { strategy: "sibling_text", value: xpath, strength: "medium" }
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(locator).toHaveBeenCalledWith(`xpath=${xpath}`);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("playbackRecordingSteps scoped candidate resolution", () => {
  it("resolves a chosen scoped candidate via its container (regression: container was previously dropped, always threw)", async () => {
    const click = vi.fn(async () => {});
    const innerGetByRole = vi.fn().mockReturnValue({ click });
    const outerGetByRole = vi.fn().mockReturnValue({ getByRole: innerGetByRole });
    const page = { ...fakePage(), getByRole: outerGetByRole } as unknown as Page;

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: {
          strategy: "scoped",
          value: 'button[name="Delete"]',
          strength: "strong",
          container: { role: "row", name: "Item 1" }
        }
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(outerGetByRole).toHaveBeenCalledWith("row", { name: "Item 1" });
    expect(innerGetByRole).toHaveBeenCalledWith("button", { name: "Delete", exact: true });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("still fails clearly (not silently) when a scoped candidate genuinely has no container", async () => {
    const page = fakePage();
    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: { strategy: "scoped", value: 'button[name="Delete"]', strength: "strong" }
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("missing container");
  });
});

describe("playbackRecordingSteps frame_path resolution", () => {
  it("resolves a frame_path-carrying candidate through frameLocator() before rendering its own strategy", async () => {
    const click = vi.fn(async () => {});
    const frameLocator = vi.fn().mockReturnValue({
      locator: vi.fn().mockReturnValue({ click })
    });
    const page = { ...fakePage(), frameLocator } as unknown as Page;

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: {
          strategy: "dom_id",
          value: "submit-btn",
          strength: "strong",
          frame_path: [
            {
              strategy: "dom_id",
              confidence: "high",
              value: "klarna-checkout-iframe",
              xpath: '//*[@id="klarna-checkout-iframe"]'
            }
          ]
        }
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(frameLocator).toHaveBeenCalledWith('xpath=//*[@id="klarna-checkout-iframe"]');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("playbackRecordingSteps tab switching", () => {
  it("switches to a popup by url and runs subsequent steps against it", async () => {
    const mainClick = vi.fn(async () => {});
    const popupClick = vi.fn(async () => {});
    const mainPage = {
      ...fakePage(),
      locator: vi.fn().mockReturnValue({ click: mainClick })
    } as unknown as Page;
    const popupPage = {
      ...fakePage(),
      url: () => "https://checkout.klarna.com/session/abc",
      title: () => Promise.resolve("Klarna Checkout"),
      bringToFront: vi.fn(async () => {}),
      locator: vi.fn().mockReturnValue({ click: popupClick })
    } as unknown as Page;

    (mainPage as unknown as { context: () => unknown }).context = () => ({
      pages: () => [mainPage, popupPage]
    });

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "switch_tab_by_url",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: null,
        url: "klarna.com"
      },
      {
        seq: 2,
        action: "click",
        timestamp: "2026-06-20T00:00:01.000Z",
        candidates: [],
        chosen: { strategy: "dom_id", value: "pay-btn", strength: "strong" }
      }
    ];

    const result = await playbackRecordingSteps(mainPage, steps, settleCfg, 1000);

    expect(result.ok).toBe(true);
    expect(mainClick).not.toHaveBeenCalled();
    expect(popupClick).toHaveBeenCalledTimes(1);
  });
});

describe("playbackRecordingSteps retry behavior for tab actions", () => {
  it("fails a switch_tab step after a single attempt, not the usual 3x retry (tab actions already poll internally)", async () => {
    // No open pages at all -> handleSwitchTab's resolvePage throws synchronously, no internal wait —
    // isolates the outer retry count without needing to wait out any real timeout.
    const pagesSpy = vi.fn().mockReturnValue([]);
    const page = fakePage();
    (page as unknown as { context: () => unknown }).context = () => ({ pages: pagesSpy });

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "switch_tab",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: null,
        index: 0
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(false);
    expect(result.action).toBe("switch_tab");
    // 1 call to set up the initial tabState + 1 call from the single attempt's resolvePage() = 2.
    // Three attempts (the old behavior) would have produced 4.
    expect(pagesSpy.mock.calls.length).toBe(2);
  });

  it("still retries an ordinary click step up to 3 times", async () => {
    const locator = vi.fn().mockReturnValue({
      click: vi.fn().mockRejectedValue(new Error("not visible"))
    });
    const page = { ...fakePage(), locator } as unknown as Page;

    const steps: RecordedStep[] = [
      {
        seq: 1,
        action: "click",
        timestamp: "2026-06-20T00:00:00.000Z",
        candidates: [],
        chosen: { strategy: "dom_id", value: "flaky-btn", strength: "strong" }
      }
    ];

    const result = await playbackRecordingSteps(page, steps, settleCfg, 1000);

    expect(result.ok).toBe(false);
    expect(locator).toHaveBeenCalledTimes(3);
  });
});

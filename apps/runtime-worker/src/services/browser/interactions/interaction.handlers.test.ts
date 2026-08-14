import type { Locator, Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import {
  handleDblclick,
  handleDrag,
  handleFill,
  handleNavigate,
  handleSelectOption,
  handleType,
  handleUploadFile
} from "./interaction.handlers.js";
import { resolveWorkerSamplePath } from "./sample-fixtures.js";

const DESC_URL = "https://app.test/";

const descriptor: ElementDescriptor = {
  testidAttr: "data-testid",
  tag: "button",
  role: "button",
  name: "Go",
  context: "main",
  testid: "go-btn",
  snapshotUrl: DESC_URL,
  locator: { strategy: "testid", confidence: "high", attr: "data-testid", value: "go-btn" }
};

function fakePage(locator: Locator, mouse?: Page["mouse"]): Page {
  return {
    url: () => DESC_URL,
    locator: () => locator,
    getByRole: () => locator,
    mouse
  } as unknown as Page;
}

function fakeLocator(methods: Partial<Locator>): Locator {
  return {
    count: vi.fn().mockResolvedValue(1),
    fill: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 20, height: 20 }),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    dragTo: vi.fn().mockResolvedValue(undefined),
    // Default: the resolved element is itself a native fillable control, so resolveFillTarget's
    // shadow-descendant drill-down never engages — matches every handler test below except the
    // ones that specifically exercise the custom-element-wrapper case.
    evaluate: vi.fn().mockResolvedValue(true),
    pressSequentially: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...methods
  } as unknown as Locator;
}

const SETTLE_CFG = { VINDICATE_SETTLE_NETWORK_MS: 10, VINDICATE_SETTLE_TIMEOUT_MS: 20 };

describe("handleNavigate", () => {
  it("defaults the hard goto condition to 'load', not 'networkidle'", async () => {
    // Regression guard: many real sites (chat widgets, analytics, websockets) never truly reach
    // network-idle. Requiring it as goto's own condition previously failed the whole navigation — and
    // with it, session creation — after burning the full timeout on a page that had already visibly
    // finished loading. 'load' always fires; the extra network-idle attempt below is best-effort only.
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = { goto, waitForLoadState } as unknown as Page;
    await handleNavigate(page, { action: "navigate", url: "https://example.com/" }, 30_000, SETTLE_CFG);
    expect(goto).toHaveBeenCalledWith("https://example.com/", {
      waitUntil: "load",
      timeout: 30_000
    });
  });

  it("makes a best-effort attempt at network-idle after the default (unspecified wait_for) navigation", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = { goto, waitForLoadState } as unknown as Page;
    await handleNavigate(page, { action: "navigate", url: "https://example.com/" }, 30_000, SETTLE_CFG);
    expect(waitForLoadState).toHaveBeenCalledTimes(1);
    const [state, opts] = waitForLoadState.mock.calls[0] as [string, { timeout: number }];
    expect(state).toBe("networkidle");
    expect(typeof opts.timeout).toBe("number");
  });

  it("does not fail navigation when the best-effort network-idle attempt times out", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockRejectedValue(new Error("Timeout exceeded"));
    const page = { goto, waitForLoadState } as unknown as Page;
    await expect(
      handleNavigate(page, { action: "navigate", url: "https://example.com/" }, 30_000, SETTLE_CFG)
    ).resolves.toEqual({ ok: true });
  });

  it("honours explicit wait_for override, with no extra best-effort settle attempt", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = { goto, waitForLoadState } as unknown as Page;
    await handleNavigate(
      page,
      { action: "navigate", url: "https://example.com/", wait_for: "domcontentloaded" },
      30_000,
      SETTLE_CFG
    );
    expect(goto).toHaveBeenCalledWith("https://example.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });
    expect(waitForLoadState).not.toHaveBeenCalled();
  });

  it("still honours an explicit wait_for:'networkidle' as a hard condition (agent's own informed choice)", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = { goto, waitForLoadState } as unknown as Page;
    await handleNavigate(
      page,
      { action: "navigate", url: "https://example.com/", wait_for: "networkidle" },
      30_000,
      SETTLE_CFG
    );
    expect(goto).toHaveBeenCalledWith("https://example.com/", {
      waitUntil: "networkidle",
      timeout: 30_000
    });
    expect(waitForLoadState).not.toHaveBeenCalled();
  });
});

describe("handleFill", () => {
  it("calls locator.fill with value", async () => {
    const fill = vi.fn().mockResolvedValue(undefined);
    const locator = fakeLocator({ fill });
    const page = fakePage(locator);
    const ctx = {
      actionTimeoutMs: 3_000,
      getDescriptor: () => descriptor
    };

    await handleFill(page, { action: "fill", ref: "ref-00000001", value: "42" }, ctx);

    expect(fill).toHaveBeenCalledWith("42", { timeout: 3_000 });
  });

  it("drills into the single native descendant when the resolved element is a non-fillable wrapper (e.g. <ion-input>)", async () => {
    const outerFill = vi.fn().mockResolvedValue(undefined);
    const innerFill = vi.fn().mockResolvedValue(undefined);
    const innerLocator = fakeLocator({ fill: innerFill });
    const outerLocator = fakeLocator({
      fill: outerFill,
      evaluate: vi.fn().mockResolvedValue(false),
      locator: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockReturnValue(innerLocator)
      })
    });
    const page = fakePage(outerLocator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    await handleFill(page, { action: "fill", ref: "ref-00000001", value: "Event name" }, ctx);

    expect(innerFill).toHaveBeenCalledWith("Event name", { timeout: 3_000 });
    expect(outerFill).not.toHaveBeenCalled();
  });

  it("leaves the original locator when the descendant match is ambiguous (0 or 2+ candidates)", async () => {
    const outerFill = vi.fn().mockResolvedValue(undefined);
    const outerLocator = fakeLocator({
      fill: outerFill,
      evaluate: vi.fn().mockResolvedValue(false),
      locator: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(2) })
    });
    const page = fakePage(outerLocator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    await handleFill(page, { action: "fill", ref: "ref-00000001", value: "x" }, ctx);

    expect(outerFill).toHaveBeenCalledWith("x", { timeout: 3_000 });
  });

  it("warns with a hint when the field reads back empty after a non-empty fill (React-controlled input ignored the programmatic value)", async () => {
    const inputValue = vi.fn().mockResolvedValue("");
    const locator = fakeLocator({ inputValue });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleFill(page, { action: "fill", ref: "ref-00000001", value: "Product-abc" }, ctx);

    expect(result.ok).toBe(true);
    expect(result.hint).toMatch(/type/);
  });

  it("does not warn when the field reads back the value that was set", async () => {
    const inputValue = vi.fn().mockResolvedValue("Product-abc");
    const locator = fakeLocator({ inputValue });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleFill(page, { action: "fill", ref: "ref-00000001", value: "Product-abc" }, ctx);

    expect(result).toEqual({ ok: true });
  });

  it("does not warn when the value being set is itself empty (a deliberate clear, not a failure)", async () => {
    const inputValue = vi.fn().mockResolvedValue("");
    const locator = fakeLocator({ inputValue });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleFill(page, { action: "fill", ref: "ref-00000001", value: "" }, ctx);

    expect(result).toEqual({ ok: true });
  });

  it("does not warn when the read-back can't be verified (e.g. contenteditable, no inputValue/textContent support)", async () => {
    // fakeLocator's defaults don't include inputValue or textContent — both throw, readBackValue
    // returns undefined ("couldn't verify"), which must not be mistaken for "empty".
    const locator = fakeLocator({});
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleFill(page, { action: "fill", ref: "ref-00000001", value: "42" }, ctx);

    expect(result).toEqual({ ok: true });
  });
});

describe("handleType", () => {
  it("calls locator.pressSequentially with value", async () => {
    const pressSequentially = vi.fn().mockResolvedValue(undefined);
    const locator = fakeLocator({ pressSequentially });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    await handleType(page, { action: "type", ref: "ref-00000001", value: "42" }, ctx);

    expect(pressSequentially).toHaveBeenCalledWith("42", { timeout: 3_000 });
  });

  it("drills into the single native descendant when the resolved element isn't focusable/editable itself", async () => {
    const outerPress = vi.fn().mockResolvedValue(undefined);
    const innerPress = vi.fn().mockResolvedValue(undefined);
    const innerLocator = fakeLocator({ pressSequentially: innerPress });
    const outerLocator = fakeLocator({
      pressSequentially: outerPress,
      evaluate: vi.fn().mockResolvedValue(false),
      locator: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
        first: vi.fn().mockReturnValue(innerLocator)
      })
    });
    const page = fakePage(outerLocator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    await handleType(page, { action: "type", ref: "ref-00000001", value: "hi" }, ctx);

    expect(innerPress).toHaveBeenCalledWith("hi", { timeout: 3_000 });
    expect(outerPress).not.toHaveBeenCalled();
  });
});

describe("handleSelectOption", () => {
  it("selects by value and echoes back the option value(s) Playwright actually selected", async () => {
    const selectOption = vi.fn().mockResolvedValue(["se"]);
    const locator = fakeLocator({ selectOption });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleSelectOption(
      page,
      { action: "select_option", ref: "ref-00000001", value: "se" },
      ctx
    );

    expect(selectOption).toHaveBeenCalledWith({ value: "se" }, { timeout: 3_000 });
    expect(result).toEqual({ ok: true, selected: ["se"] });
  });

  it("selects by label and echoes back the underlying value — useful since the caller only knows the label", async () => {
    const selectOption = vi.fn().mockResolvedValue(["se"]);
    const locator = fakeLocator({ selectOption });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleSelectOption(
      page,
      { action: "select_option", ref: "ref-00000001", label: "Sweden" },
      ctx
    );

    expect(selectOption).toHaveBeenCalledWith({ label: "Sweden" }, { timeout: 3_000 });
    expect(result).toEqual({ ok: true, selected: ["se"] });
  });

  it("selects by index and echoes back the resulting value", async () => {
    const selectOption = vi.fn().mockResolvedValue(["blue"]);
    const locator = fakeLocator({ selectOption });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleSelectOption(
      page,
      { action: "select_option", ref: "ref-00000001", index: 2 },
      ctx
    );

    expect(selectOption).toHaveBeenCalledWith({ index: 2 }, { timeout: 3_000 });
    expect(result).toEqual({ ok: true, selected: ["blue"] });
  });

  it("echoes back multiple selected values for a multi-select", async () => {
    const selectOption = vi.fn().mockResolvedValue(["red", "blue"]);
    const locator = fakeLocator({ selectOption });
    const page = fakePage(locator);
    const ctx = { actionTimeoutMs: 3_000, getDescriptor: () => descriptor };

    const result = await handleSelectOption(
      page,
      { action: "select_option", ref: "ref-00000001", value: "red" },
      ctx
    );

    expect(result.selected).toEqual(["red", "blue"]);
  });
});

describe("handleDblclick", () => {
  it("calls locator.dblclick", async () => {
    const dblclick = vi.fn().mockResolvedValue(undefined);
    const locator = fakeLocator({ dblclick });
    const page = fakePage(locator);
    const ctx = {
      actionTimeoutMs: 3_000,
      getDescriptor: () => descriptor
    };

    await handleDblclick(page, { action: "dblclick", ref: "ref-00000001" }, ctx);

    expect(dblclick).toHaveBeenCalledWith({ timeout: 3_000 });
  });
});

describe("handleDrag", () => {
  it("delegates to manual mouse drag by default", async () => {
    const move = vi.fn().mockResolvedValue(undefined);
    const down = vi.fn().mockResolvedValue(undefined);
    const up = vi.fn().mockResolvedValue(undefined);
    const locator = fakeLocator({});
    const page = fakePage(locator, { move, down, up } as unknown as Page["mouse"]);
    const ctx = {
      actionTimeoutMs: 3_000,
      getDescriptor: () => descriptor
    };

    await handleDrag(
      page,
      { action: "drag", ref: "ref-00000001", to_ref: "ref-00000002" },
      ctx
    );

    expect(down).toHaveBeenCalledOnce();
    expect(up).toHaveBeenCalledOnce();
  });
});

describe("handleUploadFile", () => {
  it("resolves sample on the worker and calls setInputFiles", async () => {
    const setInputFiles = vi.fn().mockResolvedValue(undefined);
    const locator = fakeLocator({ setInputFiles });
    const page = fakePage(locator);
    const ctx = {
      actionTimeoutMs: 3_000,
      getDescriptor: () => descriptor
    };

    await handleUploadFile(
      page,
      { action: "upload_file", ref: "ref-00000001", sample: "pdf" },
      ctx
    );

    expect(setInputFiles).toHaveBeenCalledWith([resolveWorkerSamplePath("pdf")], {
      timeout: 3_000
    });
  });
});

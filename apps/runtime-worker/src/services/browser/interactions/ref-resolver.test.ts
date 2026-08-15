import type { StructuredLocator } from "@vindicate/protocol";
import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import { ElementNotFoundError } from "../../../shared/errors/worker.errors.js";
import { resolveRef } from "./ref-resolver.js";

const PAGE_URL = "https://app.test/";

/** Mock page whose url() matches the descriptors' snapshotUrl so the URL-guard passes by default. */
function asPage(parts: Record<string, unknown>): Page {
  return { url: () => PAGE_URL, ...parts } as unknown as Page;
}

/** A locator stub with a `count()` (for the act-time guard) that is chainable via getByRole. */
function locStub(count = 1): { count: ReturnType<typeof vi.fn> } {
  return { count: vi.fn().mockResolvedValue(count) };
}

function descWith(locator: StructuredLocator): ElementDescriptor {
  return {
    testidAttr: "data-testid",
    tag: "button",
    role: "button",
    name: "",
    snapshotUrl: PAGE_URL,
    locator
  };
}

describe("resolveRef", () => {
  it("throws when descriptor is undefined", async () => {
    await expect(resolveRef({} as Page, "ref-abc", undefined)).rejects.toThrow(
      ElementNotFoundError
    );
  });

  it("throws when the descriptor is from a previous page (URL-guard)", async () => {
    const page = asPage({ locator: vi.fn() });
    const stale = {
      ...descWith({ strategy: "testid", confidence: "high", attr: "data-testid", value: "x" }),
      snapshotUrl: "https://app.test/other"
    };
    await expect(resolveRef(page, "ref-abc", stale)).rejects.toThrow(ElementNotFoundError);
  });

  it("throws when the descriptor has no structured locator", async () => {
    const page = asPage({ locator: vi.fn() });
    const desc: ElementDescriptor = {
      testidAttr: "data-testid",
      tag: "button",
      role: "button",
      name: "",
      snapshotUrl: PAGE_URL
    };
    await expect(resolveRef(page, "ref-abc", desc)).rejects.toThrow(ElementNotFoundError);
  });

  it("no-locator error does not imply retrying will help (this is not transient)", async () => {
    const page = asPage({ locator: vi.fn() });
    const desc: ElementDescriptor = {
      testidAttr: "data-testid",
      tag: "button",
      role: "button",
      name: "",
      snapshotUrl: PAGE_URL
    };
    await expect(resolveRef(page, "ref-abc", desc)).rejects.toThrow(
      /no derivable locator.*not transient.*escalate/i
    );
    await expect(resolveRef(page, "ref-abc", desc)).rejects.not.toThrow(
      /call browser_read and retry/
    );
  });

  it("renders the testid tier as an XPath honouring the session attribute", async () => {
    const locator = vi.fn().mockReturnValue(locStub());
    const page = asPage({ locator });
    await resolveRef(
      page,
      "ref-abc",
      descWith({ strategy: "testid", confidence: "high", attr: "data-cy", value: "save" })
    );
    expect(locator).toHaveBeenCalledWith('xpath=//*[@data-cy="save"]');
  });

  it("renders xpath-backed tiers (dom_id) via the stored expression", async () => {
    const locator = vi.fn().mockReturnValue(locStub());
    const page = asPage({ locator });
    await resolveRef(
      page,
      "ref-abc",
      descWith({ strategy: "dom_id", confidence: "high", value: "save", xpath: '//*[@id="save"]' })
    );
    expect(locator).toHaveBeenCalledWith('xpath=//*[@id="save"]');
  });

  it("renders the sibling_text tier as an XPath via the stored expression (no accessible name)", async () => {
    const locator = vi.fn().mockReturnValue(locStub());
    const page = asPage({ locator });
    const xpath =
      '//button[preceding-sibling::*[normalize-space()="Delete"] or following-sibling::*[normalize-space()="Delete"]]';
    await resolveRef(
      page,
      "ref-abc",
      descWith({ strategy: "sibling_text", confidence: "high", value: "Delete", xpath })
    );
    expect(locator).toHaveBeenCalledWith(`xpath=${xpath}`);
  });

  it("renders role_name via getByRole with exact name", async () => {
    const getByRole = vi.fn().mockReturnValue(locStub());
    const page = asPage({ getByRole });
    await resolveRef(
      page,
      "ref-abc",
      descWith({ strategy: "role_name", confidence: "high", role: "button", name: "Save" })
    );
    expect(getByRole).toHaveBeenCalledWith("button", { name: "Save", exact: true });
  });

  it("renders placeholder via getByPlaceholder", async () => {
    const getByPlaceholder = vi.fn().mockReturnValue(locStub());
    const page = asPage({ getByPlaceholder });
    await resolveRef(
      page,
      "ref-abc",
      descWith({ strategy: "placeholder", confidence: "high", value: "Username" })
    );
    expect(getByPlaceholder).toHaveBeenCalledWith("Username", { exact: true });
  });

  it("renders the scoped tier as a container-scoped getByRole chain", async () => {
    const inner = locStub();
    const rowGetByRole = vi.fn().mockReturnValue(inner);
    const getByRole = vi.fn().mockReturnValue({ getByRole: rowGetByRole });
    const page = asPage({ getByRole });
    await resolveRef(
      page,
      "ref-row",
      descWith({
        strategy: "scoped",
        confidence: "high",
        role: "button",
        name: "Delete",
        container: { role: "row", name: "Product ABC" }
      })
    );
    expect(getByRole).toHaveBeenCalledWith("row", { name: "Product ABC" });
    expect(rowGetByRole).toHaveBeenCalledWith("button", { name: "Delete", exact: true });
  });

  it("throws when the locator resolves to more than one element (drift guard)", async () => {
    const locator = vi.fn().mockReturnValue(locStub(2));
    const page = asPage({ locator });
    await expect(
      resolveRef(
        page,
        "ref-abc",
        descWith({ strategy: "dom_id", confidence: "high", value: "x", xpath: '//*[@id="x"]' })
      )
    ).rejects.toThrow(ElementNotFoundError);
  });

  it("does not throw on a count of 0 (auto-wait handles not-yet-rendered elements)", async () => {
    const getByRole = vi.fn().mockReturnValue(locStub(0));
    const page = asPage({ getByRole });
    await expect(
      resolveRef(
        page,
        "ref-abc",
        descWith({ strategy: "role_name", confidence: "high", role: "button", name: "Later" })
      )
    ).resolves.toBeDefined();
  });

  describe("frame_path (iframe-scoped locators)", () => {
    it("scopes into a single frameLocator hop before rendering the final strategy", async () => {
      const frameGetByRole = vi.fn().mockReturnValue(locStub());
      const frameLocatorScope = { getByRole: frameGetByRole };
      const frameLocator = vi.fn().mockReturnValue(frameLocatorScope);
      const page = asPage({ frameLocator });

      await resolveRef(
        page,
        "ref-email",
        descWith({
          strategy: "role_name",
          confidence: "high",
          role: "textbox",
          name: "Email address",
          frame_path: [
            {
              strategy: "dom_id",
              confidence: "high",
              value: "klarna-checkout-iframe",
              xpath: '//*[@id="klarna-checkout-iframe"]'
            }
          ]
        })
      );

      expect(frameLocator).toHaveBeenCalledWith('xpath=//*[@id="klarna-checkout-iframe"]');
      expect(frameGetByRole).toHaveBeenCalledWith("textbox", {
        name: "Email address",
        exact: true
      });
    });

    it("chains multiple frameLocator hops in order for a doubly-nested iframe", async () => {
      const innermostGetByRole = vi.fn().mockReturnValue(locStub());
      const innerFrameLocatorScope = { getByRole: innermostGetByRole, frameLocator: vi.fn() };
      const innerFrameLocator = vi.fn().mockReturnValue(innerFrameLocatorScope);
      const outerFrameLocatorScope = { frameLocator: innerFrameLocator };
      const outerFrameLocator = vi.fn().mockReturnValue(outerFrameLocatorScope);
      const page = asPage({ frameLocator: outerFrameLocator });

      await resolveRef(
        page,
        "ref-pay-klarna",
        descWith({
          strategy: "role_name",
          confidence: "high",
          role: "button",
          name: "Pay with Klarna",
          frame_path: [
            {
              strategy: "dom_id",
              confidence: "high",
              value: "klarna-checkout-iframe",
              xpath: '//*[@id="klarna-checkout-iframe"]'
            },
            { strategy: "nth", confidence: "low", xpath: "/html/body/iframe[1]" }
          ]
        })
      );

      expect(outerFrameLocator).toHaveBeenCalledWith('xpath=//*[@id="klarna-checkout-iframe"]');
      expect(innerFrameLocator).toHaveBeenCalledWith("xpath=/html/body/iframe[1]");
      expect(innermostGetByRole).toHaveBeenCalledWith("button", {
        name: "Pay with Klarna",
        exact: true
      });
    });

    it("renders a testid frame_path hop the same way the testid strategy renders elsewhere", async () => {
      const frameLocatorScope = { locator: vi.fn().mockReturnValue(locStub()) };
      const frameLocator = vi.fn().mockReturnValue(frameLocatorScope);
      const page = asPage({ frameLocator });

      await resolveRef(
        page,
        "ref-x",
        descWith({
          strategy: "dom_id",
          confidence: "high",
          value: "target",
          xpath: '//*[@id="target"]',
          frame_path: [
            { strategy: "testid", confidence: "high", attr: "data-testid", value: "payment-frame" }
          ]
        })
      );

      expect(frameLocator).toHaveBeenCalledWith('xpath=//*[@data-testid="payment-frame"]');
    });

    it("behaves identically to before when frame_path is absent (no regression)", async () => {
      const getByRole = vi.fn().mockReturnValue(locStub());
      const frameLocator = vi.fn();
      const page = asPage({ getByRole, frameLocator });

      await resolveRef(
        page,
        "ref-abc",
        descWith({ strategy: "role_name", confidence: "high", role: "button", name: "Save" })
      );

      expect(frameLocator).not.toHaveBeenCalled();
      expect(getByRole).toHaveBeenCalledWith("button", { name: "Save", exact: true });
    });
  });
});

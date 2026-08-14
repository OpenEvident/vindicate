import { describe, expect, it, vi } from "vitest";

import { handleSwitchTabByUrl, openPages } from "../../src/services/browser/interactions/tab.handlers.js";

describe("tab.handlers", () => {
  it("openPages filters closed pages", () => {
    const open = { isClosed: () => false };
    const closed = { isClosed: () => true };
    const context = { pages: () => [open, closed] } as never;
    expect(openPages(context)).toHaveLength(1);
  });

  describe("handleSwitchTabByUrl", () => {
    function fakePage(url: string, bringToFront = vi.fn().mockResolvedValue(undefined)): unknown {
      return {
        isClosed: () => false,
        url: () => url,
        bringToFront,
        title: vi.fn().mockResolvedValue("Some Title")
      };
    }

    it("matches immediately when the tab already exists (no polling needed)", async () => {
      const bringToFront = vi.fn().mockResolvedValue(undefined);
      const target = fakePage("https://login.klarna.com/oauth2/auth?x=1", bringToFront);
      const context = { pages: () => [fakePage("https://demo.kustom.co/checkout/"), target] } as never;
      const state = { activePageIndex: 0 };

      const result = await handleSwitchTabByUrl(context, state, "klarna.com", 2000, 50);

      expect(result.url).toContain("klarna.com");
      expect(bringToFront).toHaveBeenCalledOnce();
      expect(state.activePageIndex).toBe(1);
    });

    it("polls and finds a tab that only reaches the matching URL after a redirect completes", async () => {
      // Regression guard: a real site-opened popup (confirmed against a live Klarna checkout) starts on
      // an intermediate bounce URL and only reaches the final, recognisable URL a couple of redirects
      // later. A single instantaneous check must not be the only chance to match.
      let currentUrl = "https://js.playground.kustom.co/kcoc/loading.html";
      const popup = {
        isClosed: () => false,
        url: () => currentUrl,
        bringToFront: vi.fn().mockResolvedValue(undefined),
        title: vi.fn().mockResolvedValue("Klarna")
      };
      const context = { pages: () => [fakePage("https://demo.kustom.co/checkout/"), popup] } as never;
      const state = { activePageIndex: 0 };

      setTimeout(() => {
        currentUrl = "https://login.playground.klarna.com/oauth2/auth?x=1";
      }, 100);

      const result = await handleSwitchTabByUrl(context, state, "klarna.com", 2000, 30);

      expect(result.url).toContain("klarna.com");
      expect(state.activePageIndex).toBe(1);
    });

    it("gives an actionable error — not 'open a new tab' — when nothing ever matches", async () => {
      const context = { pages: () => [fakePage("https://demo.kustom.co/checkout/")] } as never;
      const state = { activePageIndex: 0 };

      await expect(handleSwitchTabByUrl(context, state, "klarna.com", 100, 20)).rejects.toThrow(
        /No open tab matches 'klarna\.com'.*browser_read.*other tab.*banner/s
      );
    });
  });
});

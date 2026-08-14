import type { BrowserContext, Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import { SessionLogRegistry } from "./session-log-registry.js";

describe("SessionLogRegistry ghost writes", () => {
  it("does not append network logs after drop() when response resolves later", async () => {
    const registry = new SessionLogRegistry({ consoleBufferSize: 10, networkBufferSize: 10 });
    const sessionId = "sess-ghost";

    let resolveResponse: ((value: { status: () => number }) => void) | undefined;
    const responsePromise = new Promise<{ status: () => number }>((resolve) => {
      resolveResponse = resolve;
    });

    const pageHandlers: Array<(page: Page) => void> = [];
    const context = {
      pages: (): Page[] => [],
      on: (_event: string, handler: (page: Page) => void): void => {
        pageHandlers.push(handler);
      }
    } as unknown as BrowserContext;

    registry.attachContext(sessionId, context);
    const onPage = pageHandlers[0];
    expect(onPage).toBeDefined();

    onPage?.({
      on: (event: string, handler: (req: unknown) => void): void => {
        if (event === "request") {
          handler({
            method: () => "GET",
            url: () => "https://example.com/api",
            resourceType: () => "fetch",
            response: () => responsePromise
          });
        }
      }
    } as unknown as Page);

    registry.drop(sessionId);
    resolveResponse?.({ status: () => 200 });
    await responsePromise;

    expect(registry.queryNetwork(sessionId, {})).toEqual([]);
  });
});

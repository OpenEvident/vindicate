/**
 * @vitest-environment happy-dom
 */
import type { BrowserContext, Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import { SessionLogRegistry } from "./session-log-registry.js";

describe("SessionLogRegistry.attachContext", () => {
  it("registers page listeners only once per context", () => {
    const registry = new SessionLogRegistry({ consoleBufferSize: 10, networkBufferSize: 10 });
    const handlers: Array<(page: Page) => void> = [];
    const context = {
      pages: (): Page[] => [],
      on: (_event: string, handler: (page: Page) => void): void => {
        handlers.push(handler);
      }
    } as unknown as BrowserContext;

    registry.attachContext("sess-1", context);
    registry.attachContext("sess-1", context);
    expect(handlers).toHaveLength(1);

    let pageListenerCalls = 0;
    const page = {
      on: (): void => {
        pageListenerCalls += 1;
      }
    } as unknown as Page;
    handlers[0]?.(page);
    expect(pageListenerCalls).toBe(2);
  });
});

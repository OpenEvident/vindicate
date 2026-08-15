import type { BrowserContext, Locator, Page } from "playwright-core";

import type { IBrowserBridge } from "../../src/infrastructure/browser/browser-bridge.interface.js";
import type {
  CreateContextOptions,
  CreateContextResult,
  RecordingEventSource
} from "../../src/infrastructure/browser/browser-bridge.types.js";
import { BrowserCrashError } from "../../src/shared/errors/worker.errors.js";

function fakeLocator(): Locator {
  const chain = {
    count: (): Promise<number> => Promise.resolve(1),
    first: (): Locator => chain as unknown as Locator,
    isVisible: (): Promise<boolean> => Promise.resolve(true),
    isDisabled: (): Promise<boolean> => Promise.resolve(false),
    getAttribute: (): Promise<string | null> => Promise.resolve(null),
    click: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
    pressSequentially: (): Promise<void> => Promise.resolve(),
    selectOption: (): Promise<void> => Promise.resolve(),
    hover: (): Promise<void> => Promise.resolve(),
    focus: (): Promise<void> => Promise.resolve(),
    blur: (): Promise<void> => Promise.resolve(),
    press: (): Promise<void> => Promise.resolve(),
    evaluate: (): Promise<void> => Promise.resolve(),
    scrollIntoViewIfNeeded: (): Promise<void> => Promise.resolve(),
    waitFor: (): Promise<void> => Promise.resolve(),
    screenshot: (): Promise<Buffer> =>
      Promise.resolve(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]))
  };
  return chain as unknown as Locator;
}

function fakeContext(): BrowserContext {
  const pages: Page[] = [];
  return {
    pages: (): Page[] => pages,
    on: (): void => {
      /* noop */
    },
    exposeFunction: (): Promise<void> => Promise.resolve(),
    addInitScript: (): Promise<void> => Promise.resolve(),
    cookies: (): Promise<[]> => Promise.resolve([]),
    addCookies: (): Promise<void> => Promise.resolve(),
    clearCookies: (): Promise<void> => Promise.resolve()
  } as unknown as BrowserContext;
}

export class FakeBrowserBridge implements IBrowserBridge {
  private readonly alive = new Set<string>();
  private readonly contexts = new Map<string, BrowserContext>();
  private readonly tabState = new Map<string, { activePageIndex: number }>();
  private readonly createContextFailures = new Map<string, Error>();
  private readonly deadHandlers: Array<(sessionId: string, reason: string) => void> = [];
  private readonly lastGotoUrlBySession = new Map<string, string>();

  /** Test helper — last url passed to page.goto for a session after create. */
  getLastGotoUrl(sessionId: string): string | undefined {
    return this.lastGotoUrlBySession.get(sessionId);
  }

  /** Test helper — next createContext for this session rejects once. */
  failNextCreateContext(
    sessionId: string,
    error: Error = new Error("fake bridge: createContext failed")
  ): void {
    this.createContextFailures.set(sessionId, error);
  }

  onContextDead(callback: (sessionId: string, reason: string) => void): void {
    this.deadHandlers.push(callback);
  }

  hasContext(sessionId: string): boolean {
    return this.alive.has(sessionId);
  }

  createContext(sessionId: string, options?: CreateContextOptions): Promise<CreateContextResult> {
    void options;
    if (this.alive.has(sessionId)) {
      return Promise.resolve({ created: false });
    }
    const failure = this.createContextFailures.get(sessionId);
    if (failure !== undefined) {
      this.createContextFailures.delete(sessionId);
      return Promise.reject(failure);
    }
    this.alive.add(sessionId);
    this.contexts.set(sessionId, fakeContext());
    this.tabState.set(sessionId, { activePageIndex: 0 });
    return Promise.resolve({ created: true });
  }

  async ensureHealthyContext(
    sessionId: string,
    options?: CreateContextOptions
  ): Promise<CreateContextResult> {
    void options;
    if (!this.alive.has(sessionId)) {
      return this.createContext(sessionId);
    }
    return { created: false };
  }

  destroyContext(sessionId: string): Promise<void> {
    this.alive.delete(sessionId);
    this.contexts.delete(sessionId);
    this.tabState.delete(sessionId);
    this.lastGotoUrlBySession.delete(sessionId);
    return Promise.resolve();
  }

  getTabState(sessionId: string): { activePageIndex: number } {
    if (!this.alive.has(sessionId)) {
      throw new BrowserCrashError("fake bridge: no browser context for session");
    }
    return this.tabState.get(sessionId) ?? { activePageIndex: 0 };
  }

  getContext(sessionId: string): BrowserContext {
    if (!this.alive.has(sessionId)) {
      throw new BrowserCrashError("fake bridge: no browser context for session");
    }
    const ctx = this.contexts.get(sessionId);
    if (ctx === undefined) {
      throw new BrowserCrashError("fake bridge: no browser context for session");
    }
    return ctx;
  }

  getPage(sessionId: string): Promise<Page> {
    if (!this.alive.has(sessionId)) {
      throw new BrowserCrashError("fake bridge: no browser context for session");
    }
    const ctx = this.getContext(sessionId);
    const page = {
      goto: (url: string): Promise<void> => {
        this.lastGotoUrlBySession.set(sessionId, url);
        return Promise.resolve();
      },
      url: (): string => "https://example.com/",
      title: (): Promise<string> => Promise.resolve("Example"),
      waitForLoadState: (): Promise<void> => Promise.resolve(),
      waitForURL: (): Promise<void> => Promise.resolve(),
      waitForTimeout: (): Promise<void> => Promise.resolve(),
      on: (): void => {
        /* noop */
      },
      off: (): void => {
        /* noop */
      },
      screenshot: (): Promise<Buffer> =>
        Promise.resolve(Buffer.from([0x89, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      context: (): BrowserContext => ctx,
      locator: (): Locator => fakeLocator(),
      // A real page with no iframes reports exactly one frame (the main frame) — matches
      // captureChildFrames' cheap zero-iframe fast path, so it never fires in these fake-bridge tests.
      frames: (): Page[] => [page as unknown as Page],
      keyboard: { press: (): Promise<void> => Promise.resolve() },
      evaluate: (fn: unknown): Promise<unknown> => {
        if (typeof fn !== "function") {
          return Promise.resolve({});
        }
        const body = String(fn);
        if (body.includes("__VINDICATE_EVAL__:settle_dom_quiet__")) {
          return Promise.resolve(0);
        }
        if (body.includes("__VINDICATE_EVAL__:interactive_snapshot__")) {
          return Promise.resolve({
            elements: [],
            truncated: false,
            collapsed_count: 0,
            alerts: []
          });
        }
        if (
          body.includes("__VINDICATE_EVAL__:get_storage__") ||
          body.includes("__VINDICATE_EVAL__:set_storage__") ||
          body.includes("__VINDICATE_EVAL__:clear_storage__")
        ) {
          return Promise.resolve({});
        }
        if (body.includes("window.scrollBy")) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(
          new Error(
            "FakeBrowserBridge: unhandled page.evaluate — add a __VINDICATE_EVAL__ marker or exercise this path in happy-dom tests"
          )
        );
      }
    };
    return Promise.resolve(page as unknown as Page);
  }

  getWsEndpoint(sessionId: string): string {
    if (!this.alive.has(sessionId)) {
      throw new BrowserCrashError("fake bridge: no browser context for session");
    }
    return "ws://127.0.0.1:9222/fake";
  }

  closeAll(): Promise<void> {
    this.alive.clear();
    this.contexts.clear();
    return Promise.resolve();
  }

  setupRecording(
    _sessionId: string,
    _onEvent: (
      payload: Record<string, unknown>,
      source: RecordingEventSource
    ) => void | Promise<void>
  ): Promise<void> {
    void _sessionId;
    void _onEvent;
    return Promise.resolve();
  }

  injectScript(_sessionId: string, _script: string): Promise<void> {
    void _sessionId;
    void _script;
    return Promise.resolve();
  }

  /** Test helper — simulates unexpected context loss. */
  simulateContextDead(sessionId: string, reason: string): void {
    this.alive.delete(sessionId);
    for (const handler of this.deadHandlers) {
      handler(sessionId, reason);
    }
  }
}

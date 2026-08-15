/**
 * @file Browser pool — at most one headed and one headless Chromium process, each shared across
 * sessions of the same mode. Browser is launched on first demand and closed when its last session
 * ends. Each session gets its own isolated BrowserContext (no shared cookies / storage).
 */
import type { Logger } from "@vindicate/observability";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import { BrowserCrashError, BrowserUnavailableError } from "../../shared/errors/worker.errors.js";
import type { HighlightService } from "../../services/browser/highlight/highlight-service.js";
import type { IBrowserBridge } from "./browser-bridge.interface.js";
import type {
  CreateContextOptions,
  CreateContextResult,
  RecordingEventSource
} from "./browser-bridge.types.js";
import type { SessionBrowserState } from "./session-browser-state.js";

export class PlaywrightBridge implements IBrowserBridge {
  /**
   * At most two entries: one for headless=false (headed) and one for headless=true.
   * Keyed by the headless boolean so sessions that share a mode share a process.
   */
  private readonly browserPool = new Map<boolean, Browser>();

  /** All per-session state in one place (context, headless mode, close-in-progress). */
  private readonly sessions = new Map<string, SessionBrowserState>();

  /**
   * Browser modes (headless boolean) currently being intentionally shut down via
   * `shutdownBrowserIfIdle`. Prevents the `disconnected` handler from treating a
   * deliberate `browser.close()` as an unexpected crash.
   */
  private readonly intentionalBrowserClose = new Set<boolean>();

  private readonly recordingSetupSessions = new Set<string>();

  private readonly deadHandlers: Array<(sessionId: string, reason: string) => void> = [];

  constructor(
    private readonly logger: Logger,
    private readonly highlightService?: HighlightService
  ) {}

  onContextDead(callback: (sessionId: string, reason: string) => void): void {
    this.deadHandlers.push(callback);
  }

  hasContext(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  private getSession(sessionId: string): SessionBrowserState | undefined {
    return this.sessions.get(sessionId);
  }

  private removeSession(sessionId: string): SessionBrowserState | undefined {
    const state = this.sessions.get(sessionId);
    if (state !== undefined) {
      this.sessions.delete(sessionId);
    }
    return state;
  }

  private emitDead(sessionId: string, reason: string): void {
    for (const h of this.deadHandlers) {
      h(sessionId, reason);
    }
  }

  private sessionsForHeadless(headless: boolean): SessionBrowserState[] {
    return [...this.sessions.values()].filter((s) => s.headless === headless);
  }

  /**
   * Returns the browser for the given headless mode, launching one if none exists yet.
   * Registers a `disconnected` handler that marks all sessions using that mode as dead.
   */
  private async getOrLaunchBrowser(headless: boolean): Promise<Browser> {
    const existing = this.browserPool.get(headless);
    if (existing !== undefined) {
      return existing;
    }

    let browser: Browser;
    try {
      browser = await chromium.launch({ headless });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, headless }, "chromium launch failed");

      // Playwright's own "browser not installed" error is a multi-line ASCII banner meant for
      // a terminal, not a webview — detect it and surface a short, human message plus the
      // install command structurally instead of dumping the raw banner into the UI.
      if (msg.includes("npx playwright install")) {
        throw new BrowserUnavailableError(
          "Chromium isn't installed yet. Playwright needs to download it once before recording can start.",
          "npx playwright install"
        );
      }
      throw new BrowserUnavailableError(
        `Failed to launch ${headless ? "headless" : "headed"} Chromium: ${msg}. ` +
          "Run the bootstrap script to install Playwright browsers."
      );
    }

    browser.on("disconnected", () => {
      this.browserPool.delete(headless);

      if (this.intentionalBrowserClose.has(headless)) {
        this.intentionalBrowserClose.delete(headless);
        this.logger.info({ headless }, "browser process shut down cleanly");
        return;
      }

      this.logger.warn({ headless }, "browser process disconnected unexpectedly");

      for (const [sessionId, state] of [...this.sessions.entries()]) {
        if (state.headless !== headless) {
          continue;
        }
        this.sessions.delete(sessionId);
        if (!state.closing) {
          this.emitDead(sessionId, "browser_disconnected");
        }
      }
    });

    this.browserPool.set(headless, browser);
    this.logger.info({ headless }, "launched browser process");
    return browser;
  }

  /**
   * Shuts down the browser for `headless` mode if no sessions are left using it.
   * Called after a context is removed so we don't keep idle processes around.
   */
  private async shutdownBrowserIfIdle(headless: boolean): Promise<void> {
    if (this.sessionsForHeadless(headless).length > 0) {
      return;
    }
    const browser = this.browserPool.get(headless);
    if (browser === undefined) {
      return;
    }
    this.browserPool.delete(headless);
    this.intentionalBrowserClose.add(headless);
    this.logger.info({ headless }, "no sessions left — shutting down browser process");
    await browser.close().catch((err: unknown) => {
      this.intentionalBrowserClose.delete(headless);
      this.logger.warn(
        { err, headless },
        "browser close after last session failed — process may linger"
      );
    });
  }

  async createContext(
    sessionId: string,
    options?: CreateContextOptions
  ): Promise<CreateContextResult> {
    if (this.sessions.has(sessionId)) {
      this.logger.warn({ sessionId }, "createContext called but context already exists — reusing");
      return { created: false };
    }

    const headless = options?.headless ?? false;
    const browser = await this.getOrLaunchBrowser(headless);

    let context: BrowserContext;
    try {
      context = await browser.newContext();
      await context.addInitScript(() => {
        (window as unknown as Record<string, unknown>).__name = (fn: unknown) => fn;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BrowserUnavailableError(
        `Failed to create browser context for session ${sessionId}: ${msg}`
      );
    }

    const state: SessionBrowserState = { headless, context, closing: false, activePageIndex: 0 };

    context.on("close", () => {
      const current = this.getSession(sessionId);
      if (current === undefined) {
        return;
      }
      if (this.highlightService !== undefined) {
        const pages = current.context.pages().filter((p) => !p.isClosed());
        this.highlightService.disposeSession(pages[0], sessionId);
      }
      if (!current.closing) {
        const mode = current.headless;
        this.removeSession(sessionId);
        this.emitDead(sessionId, "context_closed");
        void this.shutdownBrowserIfIdle(mode);
      }
    });

    this.sessions.set(sessionId, state);
    this.logger.info({ sessionId, headless }, "browser context created");
    return { created: true };
  }

  async ensureHealthyContext(
    sessionId: string,
    options?: CreateContextOptions
  ): Promise<CreateContextResult> {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      return this.createContext(sessionId, options);
    }

    const openPages = state.context.pages().filter((p) => !p.isClosed());
    if (openPages.length === 0) {
      this.logger.warn({ sessionId }, "ensureHealthyContext: no open pages — recreating context");
      await this.destroyContext(sessionId);
      return this.createContext(sessionId, options);
    }

    try {
      await openPages[0]!.waitForLoadState("domcontentloaded", { timeout: 5000 });
      return { created: false };
    } catch (err: unknown) {
      this.logger.warn(
        { err, sessionId },
        "ensureHealthyContext: page health check failed — recreating context"
      );
      await this.destroyContext(sessionId);
      return this.createContext(sessionId, options);
    }
  }

  async destroyContext(sessionId: string): Promise<void> {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      return;
    }

    state.closing = true;

    try {
      await state.context.close();
    } catch (err: unknown) {
      this.logger.warn({ err, sessionId }, "context close failed");
    } finally {
      const headless = state.headless;
      this.recordingSetupSessions.delete(sessionId);
      this.removeSession(sessionId);
      await this.shutdownBrowserIfIdle(headless);
    }
  }

  async closeAll(): Promise<void> {
    const browsers = [...this.browserPool.entries()];
    for (const [headless, browser] of browsers) {
      this.browserPool.delete(headless);
      this.intentionalBrowserClose.add(headless);
      await browser.close().catch((err: unknown) => {
        this.intentionalBrowserClose.delete(headless);
        this.logger.warn({ err, headless }, "closeAll: browser close failed");
      });
    }
    this.sessions.clear();
  }

  getContext(sessionId: string): BrowserContext {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      throw new BrowserCrashError("browser context unavailable");
    }
    return state.context;
  }

  getTabState(sessionId: string): { activePageIndex: number } {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      throw new BrowserCrashError("browser context unavailable");
    }
    return state;
  }

  async getPage(sessionId: string): Promise<Page> {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      throw new BrowserCrashError("browser context unavailable");
    }
    const openPages = state.context.pages().filter((p) => !p.isClosed());
    if (openPages.length > 0) {
      const idx = Math.min(state.activePageIndex, openPages.length - 1);
      state.activePageIndex = idx;
      return openPages[idx]!;
    }
    const page = await state.context.newPage();
    state.activePageIndex = 0;
    return page;
  }

  async setupRecording(
    sessionId: string,
    onEvent: (
      payload: Record<string, unknown>,
      source: RecordingEventSource
    ) => void | Promise<void>
  ): Promise<void> {
    if (this.recordingSetupSessions.has(sessionId)) {
      return;
    }
    const state = this.getSession(sessionId);
    if (state === undefined) {
      throw new BrowserCrashError("browser context unavailable");
    }
    // exposeBinding (not exposeFunction) so the callback's `source.page`/`source.frame` tell us exactly
    // which page and frame the event fired in — a nested iframe, or a popup page distinct from the
    // session's tracked "active" tab. Both are context-scoped, so this still reaches every frame of
    // every page (including future popups) with no extra wiring, same as exposeFunction did.
    await state.context.exposeBinding("__vindicateRecordEvent", (source, payload: unknown) => {
      if (typeof payload === "object" && payload !== null) {
        // Orphaned rejection here would be process-fatal (no awaiter) — a bad
        // recording event must not take down the whole worker.
        void Promise.resolve(
          onEvent(payload as Record<string, unknown>, { page: source.page, frame: source.frame })
        ).catch((err: unknown) => {
          this.logger.warn({ err, sessionId }, "recording event handler failed");
        });
      }
    });
    await state.context.exposeBinding("__vindicateStopRecording", async (source) => {
      await Promise.resolve(
        onEvent({ event: "__stop_requested" }, { page: source.page, frame: source.frame })
      );
    });
    this.recordingSetupSessions.add(sessionId);
  }

  async injectScript(sessionId: string, script: string): Promise<void> {
    const state = this.getSession(sessionId);
    if (state === undefined) {
      throw new BrowserCrashError("browser context unavailable");
    }
    await state.context.addInitScript(script);
    for (const page of state.context.pages()) {
      if (!page.isClosed()) {
        await page.evaluate(script).catch(() => {});
      }
    }
  }
}

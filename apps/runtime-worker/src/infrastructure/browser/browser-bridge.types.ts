/**
 * @file Shared types for {@link IBrowserBridge} implementations.
 */
import type { Frame, Page } from "playwright-core";

/**
 * Where a recording event actually originated — the exact `Page` and `Frame` (which may be a nested
 * iframe, or a popup page distinct from the session's tracked "active" tab) whose document the event
 * fired in. Sourced from `BrowserContext.exposeBinding`'s callback, which is context-scoped and reaches
 * every frame of every page automatically — unlike `exposeFunction`, it also reports *which* one.
 */
export interface RecordingEventSource {
  readonly page: Page;
  readonly frame: Frame;
}

export interface CreateContextResult {
  /** `true` when a new Playwright context was created; `false` when an existing one was reused. */
  readonly created: boolean;
}

export interface CreateContextOptions {
  /** Whether to launch in headless mode. Defaults to `false` (headed). */
  readonly headless?: boolean;
}

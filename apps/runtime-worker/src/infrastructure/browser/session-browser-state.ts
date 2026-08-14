/**
 * @file Per-session browser state — single record replaces parallel maps/sets.
 */
import type { BrowserContext } from "playwright-core";

export interface SessionBrowserState {
  readonly headless: boolean;
  context: BrowserContext;
  /** True while {@link PlaywrightBridge.destroyContext} is closing this session. */
  closing: boolean;
  activePageIndex: number;
}

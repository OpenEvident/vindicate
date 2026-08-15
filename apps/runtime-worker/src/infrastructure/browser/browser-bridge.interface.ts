/**
 * @file Playwright seam — browser service depends on this interface only.
 */
import type { BrowserContext, Page } from "playwright-core";

import type {
  CreateContextOptions,
  CreateContextResult,
  RecordingEventSource
} from "./browser-bridge.types.js";

export type {
  CreateContextOptions,
  CreateContextResult,
  RecordingEventSource
} from "./browser-bridge.types.js";

export interface IBrowserBridge {
  hasContext(sessionId: string): boolean;
  createContext(sessionId: string, options?: CreateContextOptions): Promise<CreateContextResult>;
  /** Recreates the context when missing or unhealthy (all pages closed / load check failed). */
  ensureHealthyContext(
    sessionId: string,
    options?: CreateContextOptions
  ): Promise<CreateContextResult>;
  destroyContext(sessionId: string): Promise<void>;
  getContext(sessionId: string): BrowserContext;
  getTabState(sessionId: string): { activePageIndex: number };
  getPage(sessionId: string): Promise<Page>;
  setupRecording(
    sessionId: string,
    onEvent: (
      payload: Record<string, unknown>,
      source: RecordingEventSource
    ) => void | Promise<void>
  ): Promise<void>;
  injectScript(sessionId: string, script: string): Promise<void>;
  onContextDead(callback: (sessionId: string, reason: string) => void): void;
  /** Closes all open browser processes. Called on worker shutdown. */
  closeAll(): Promise<void>;
}

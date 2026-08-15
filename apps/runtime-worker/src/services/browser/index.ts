/**
 * @file Browser service Fastify plugin — registers `/browser/*` routes.
 */
import type { Logger } from "@vindicate/observability";
import type { FastifyPluginCallback } from "fastify";

import type { IEventBus } from "../../core/events/event-bus.interface.js";
import type { IResourceGovernor } from "../../core/governor/resource-governor.interface.js";
import type { BrowserCommandConfigSlice } from "./routes/session.routes.js";
import type { IBrowserBridge } from "../../infrastructure/browser/browser-bridge.interface.js";
import type { BrowserQueueManager } from "./queue/browser.queue.js";
import { registerBrowserSessionRoutes } from "./routes/session.routes.js";
import { registerLogRoutes } from "./routes/log.routes.js";
import { registerSessionFilesRoutes } from "./routes/session-files.routes.js";
import type { SessionActionLog } from "./logs/action-log.js";
import type { SessionLogRegistry } from "./logs/session-log-registry.js";
import type { ISessionStore } from "./session/session.store.interface.js";
import type { HighlightService } from "./highlight/highlight-service.js";
import type { SnapshotEngine } from "./snapshot/snapshot-engine.js";
import type { RecordingService } from "./recording/recording.service.js";

export interface BrowserPluginOptions {
  readonly logger: Logger;
  readonly store: ISessionStore;
  readonly bridge: IBrowserBridge;
  readonly queues: BrowserQueueManager;
  readonly governor: IResourceGovernor;
  readonly commandConfig: BrowserCommandConfigSlice;
  readonly snapshotEngine: SnapshotEngine;
  readonly highlightService: HighlightService;
  readonly eventBus: IEventBus;
  readonly sessionLogs: SessionLogRegistry;
  readonly actionLog: SessionActionLog;
  readonly maxFileBytes: number;
  readonly recordingService: RecordingService;
}

export const browserPlugin: FastifyPluginCallback<BrowserPluginOptions> = (fastify, opts, done) => {
  registerBrowserSessionRoutes(fastify, {
    store: opts.store,
    bridge: opts.bridge,
    queues: opts.queues,
    governor: opts.governor,
    commandConfig: opts.commandConfig,
    logger: opts.logger,
    snapshotEngine: opts.snapshotEngine,
    highlightService: opts.highlightService,
    eventBus: opts.eventBus,
    sessionLogs: opts.sessionLogs,
    actionLog: opts.actionLog,
    recordingService: opts.recordingService
  });
  registerLogRoutes(fastify, {
    store: opts.store,
    logs: opts.sessionLogs,
    actionLog: opts.actionLog
  });
  registerSessionFilesRoutes(fastify, { store: opts.store, maxFileBytes: opts.maxFileBytes });
  done();
};

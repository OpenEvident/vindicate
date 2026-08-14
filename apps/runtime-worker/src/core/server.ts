/**
 * @file Fastify application factory — transport shell; domain plugins register later.
 */
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { Logger } from "@vindicate/observability";

import { registerErrorHandler } from "../shared/errors/error-handler.js";
import type { IEventBus } from "./events/event-bus.interface.js";
import { registerCapabilitiesRoutes } from "../health/capabilities.routes.js";
import { registerEventsRoutes } from "../health/events.routes.js";
import { registerHealthRoutes, type HealthRouteDeps } from "../health/health.routes.js";
import { registerApiRequestRoutes } from "../services/api-request/api-request.routes.js";
import { config } from "./config.js";
import { registerInternalKeyMiddleware } from "./middleware/internal-key.middleware.js";
import { SessionDiskStore } from "../infrastructure/persistence/session-disk-store.js";
import type { IBrowserBridge } from "../infrastructure/browser/browser-bridge.interface.js";
import type { IResourceGovernor } from "./governor/resource-governor.interface.js";
import type { BrowserCommandConfigSlice } from "../services/browser/routes/session.routes.js";
import { browserPlugin } from "../services/browser/index.js";
import type { BrowserQueueManager } from "../services/browser/queue/browser.queue.js";
import type { SessionActionLog } from "../services/browser/logs/action-log.js";
import type { SessionLogRegistry } from "../services/browser/logs/session-log-registry.js";
import type { HighlightService } from "../services/browser/highlight/highlight-service.js";
import type { SnapshotEngine } from "../services/browser/snapshot/snapshot-engine.js";
import type { ISessionStore } from "../services/browser/session/session.store.interface.js";
import type { RecordingService } from "../services/browser/recording/recording.service.js";

export interface BrowserServices {
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

export interface BuildServerOptions {
  readonly logger: Logger;
  readonly eventBus: IEventBus;
  readonly eventsBufferSize: number;
  readonly browser?: BrowserServices;
  readonly lifecycle?: HealthRouteDeps;
}

export async function buildServer(options: BuildServerOptions) {
  const fastify = Fastify({
    loggerInstance: options.logger,
    requestIdHeader: "x-request-id",
    disableRequestLogging: true
  });

  registerErrorHandler(fastify, options.logger);
  registerInternalKeyMiddleware(fastify, config.VINDICATE_INTERNAL_KEY);

  await fastify.register(sensible);
  await fastify.register(cors, { origin: true });

  registerHealthRoutes(
    fastify,
    options.lifecycle ?? {
      isReady: () => true,
      sessionsDir: SessionDiskStore.defaultDir()
    }
  );
  registerCapabilitiesRoutes(fastify);
  registerEventsRoutes(fastify, options.eventBus, { bufferSize: options.eventsBufferSize });
  registerApiRequestRoutes(fastify);

  if (options.browser !== undefined) {
    await fastify.register(browserPlugin, {
      store: options.browser.store,
      bridge: options.browser.bridge,
      queues: options.browser.queues,
      governor: options.browser.governor,
      commandConfig: options.browser.commandConfig,
      snapshotEngine: options.browser.snapshotEngine,
      highlightService: options.browser.highlightService,
      eventBus: options.browser.eventBus,
      sessionLogs: options.browser.sessionLogs,
      actionLog: options.browser.actionLog,
      maxFileBytes: options.browser.maxFileBytes,
      recordingService: options.browser.recordingService,
      logger: options.logger,
      prefix: "/browser"
    });
  }

  return fastify;
}

/**
 * @file Thin HTTP routes for browser sessions (IMPLEMENTATION-PLAN §4).
 */
import {
  BrowserCreateSessionBodySchema,
  BrowserCreateSessionResponseSchema,
  BrowserResumeBodySchema,
  RecordingArtifactSchema
} from "@vindicate/protocol";
import type { Logger } from "@vindicate/observability";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import type { IEventBus } from "../../../core/events/event-bus.interface.js";
import type { IResourceGovernor } from "../../../core/governor/resource-governor.interface.js";
import { isShuttingDown } from "../../../core/shutdown.js";
import type { IBrowserBridge } from "../../../infrastructure/browser/browser-bridge.interface.js";
import { resolveProjectPath } from "../../files/path-guard.js";
import {
  BrowserUnavailableError,
  SessionDeadError,
  SessionNotFoundError,
  SessionPausedError,
  SessionUnresumableError,
  ValidationError
} from "../../../shared/errors/worker.errors.js";
import { executeCommandSteps } from "../commands/command-executor.js";
import { handleNavigate } from "../interactions/interaction.handlers.js";
import type { BrowserQueueManager } from "../queue/browser.queue.js";
import type { ISessionStore } from "../session/session.store.interface.js";
import type { SessionActionLog } from "../logs/action-log.js";
import type { SessionLogRegistry } from "../logs/session-log-registry.js";
import type { HighlightService } from "../highlight/highlight-service.js";
import type { RecordingService } from "../recording/recording.service.js";
import type { RecordingStep } from "../recording/recording.types.js";
import { RecordingsIndexService } from "../recording/recordings-index.service.js";
import { playbackRecordingSteps } from "../recording/recording-playback.service.js";
import { buildTestidCandidates, type SnapshotEngine } from "../snapshot/snapshot-engine.js";

const ProjectRootQuerySchema = z.object({
  project_root: z.string().min(1)
});

const RecordingStartBodySchema = z.object({
  name: z.string().min(1).max(100),
  started_by: z.enum(["human", "agent"]).optional(),
  testid_attr: z.string().optional(),
  skip_entry_navigate: z.boolean().optional()
});

const RecordingFinalizeBodySchema = z.object({
  steps: z.array(z.object({ seq: z.number().int().positive() }).passthrough()).optional(),
  pre_conditions: z.array(z.string()).optional(),
  post_conditions: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  summary: z.string().optional(),
  close_session: z.boolean().optional()
});

const RecordingDiscardBodySchema = z.object({
  close_session: z.boolean().optional()
});

const RecordingPlaybackBodySchema = z.object({
  recordingName: z.string().min(1)
});

const RecordingAnnotateBodySchema = z.object({
  pre_conditions: z.array(z.string()),
  post_conditions: z.array(z.string()),
  depends_on: z.array(z.string()).default([]),
  summary: z.string()
});

const ResumeFromPauseQuerySchema = z.object({
  include_snapshot: z.enum(["true", "false", "1", "0"]).optional()
});

export interface BrowserCommandConfigSlice {
  readonly VINDICATE_SETTLE_NETWORK_MS: number;
  readonly VINDICATE_SETTLE_TIMEOUT_MS: number;
  readonly VINDICATE_ACTION_TIMEOUT_MS: number;
  readonly VINDICATE_ACTION_TIMEOUT_MAX_MS: number;
}

const CommandsBodySchema = z.object({
  steps: z
    .array(
      z
        .object({
          action: z.string().min(1)
        })
        .passthrough()
    )
    .min(1)
});

function sseWrite(raw: ServerResponse, payload: unknown): void {
  raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export interface BrowserSessionRouteDeps {
  readonly store: ISessionStore;
  readonly bridge: IBrowserBridge;
  readonly queues: BrowserQueueManager;
  readonly governor: IResourceGovernor;
  readonly logger: Logger;
  readonly snapshotEngine: SnapshotEngine;
  readonly highlightService: HighlightService;
  readonly eventBus: IEventBus;
  readonly sessionLogs: SessionLogRegistry;
  readonly actionLog: SessionActionLog;
  readonly commandConfig: BrowserCommandConfigSlice;
  readonly recordingService: RecordingService;
}

export function registerBrowserSessionRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  deps: BrowserSessionRouteDeps
): void {
  const {
    store,
    bridge,
    queues,
    governor,
    logger,
    snapshotEngine,
    highlightService,
    eventBus,
    sessionLogs,
    actionLog,
    commandConfig,
    recordingService
  } = deps;

  async function teardownSession(id: string): Promise<void> {
    await bridge.destroyContext(id).catch((err: unknown) => {
      logger.warn({ err, sessionId: id }, "destroyContext during teardown failed");
    });
    const activeRecording = recordingService.getState(id);
    if (activeRecording?.status === "recording") {
      await recordingService.discard(id).catch(() => {});
    }
    snapshotEngine.dropSession(id);
    sessionLogs.drop(id);
    actionLog.drop(id);
    queues.dropSession(id);
    const rec = store.get(id);
    if (rec !== undefined) {
      await store.applyTrigger(id, "end");
    }
  }

  fastify.post("/sessions", async (request, reply) => {
    const parsed = BrowserCreateSessionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      throw new ValidationError(`Invalid create session body — ${details}`);
    }
    const record = await store.create(parsed.data);
    snapshotEngine.setSessionOptions(record.session_id, {
      testidCandidates: buildTestidCandidates(record.testid_attr)
    });
    try {
      await bridge.createContext(record.session_id, { headless: record.headless });
      sessionLogs.attachContext(record.session_id, bridge.getContext(record.session_id));
      const page = await bridge.getPage(record.session_id);
      await handleNavigate(
        page,
        { action: "navigate", url: record.url },
        commandConfig.VINDICATE_ACTION_TIMEOUT_MS,
        {
          VINDICATE_SETTLE_NETWORK_MS: commandConfig.VINDICATE_SETTLE_NETWORK_MS,
          VINDICATE_SETTLE_TIMEOUT_MS: commandConfig.VINDICATE_SETTLE_TIMEOUT_MS
        }
      );
    } catch (err: unknown) {
      await store.abandon(record.session_id);
      await bridge.destroyContext(record.session_id).catch(() => {});
      logger.error(
        { err, sessionId: record.session_id },
        "failed to create browser context or initial navigation"
      );
      throw err;
    }
    const response = BrowserCreateSessionResponseSchema.parse({
      session_id: record.session_id,
      name: record.name,
      status: record.status
    });
    return reply.send(response);
  });

  fastify.get("/sessions", async (_request, reply) => {
    return reply.send(store.list());
  });

  fastify.delete<{ Params: { id: string } }>("/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const rec = store.get(id);
    if (rec === undefined) {
      throw new SessionNotFoundError(id);
    }
    await teardownSession(id);
    return reply.send({ ok: true as const });
  });

  fastify.post<{ Params: { id: string } }>("/sessions/:id/resume", async (request, reply) => {
    const { id } = request.params;
    const parsedBody = BrowserResumeBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      throw new ValidationError("Invalid resume body");
    }
    void parsedBody.data;
    const rec = store.get(id);
    if (rec === undefined) {
      throw new SessionNotFoundError(id);
    }
    if (rec.status !== "dead") {
      throw new SessionUnresumableError(id, "session is not in dead (resumable) state");
    }
    await store.applyTrigger(id, "resume");
    try {
      await bridge.createContext(id, { headless: rec.headless });
      sessionLogs.attachContext(id, bridge.getContext(id));
    } catch (err: unknown) {
      logger.error({ err, sessionId: id }, "resume failed to recreate context");
      await store.applyTrigger(id, "crash").catch(() => {
        /* ignore rollback errors */
      });
      throw err;
    }
    return reply.send({ session_id: id, status: "active" as const });
  });

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/resume_from_pause",
    async (request, reply) => {
      const { id } = request.params;
      const queryParsed = ResumeFromPauseQuerySchema.safeParse(request.query ?? {});
      if (!queryParsed.success) {
        throw new ValidationError("Invalid resume_from_pause query");
      }
      const flag = queryParsed.data.include_snapshot;
      const includeSnapshot = flag === "true" || flag === "1";

      const rec = store.get(id);
      if (rec === undefined) {
        throw new SessionNotFoundError(id);
      }
      if (rec.status !== "paused") {
        throw new SessionUnresumableError(id, "session is not paused");
      }
      await store.applyTrigger(id, "resume_from_pause");
      try {
        const created = await bridge.createContext(id, { headless: rec.headless });
        if (!created.created) {
          logger.warn(
            { sessionId: id },
            "resume_from_pause reusing existing browser context — verifying health"
          );
          await bridge.ensureHealthyContext(id, { headless: rec.headless });
        }
      } catch (err: unknown) {
        logger.error({ err, sessionId: id }, "resume_from_pause failed to recreate context");
        await store.applyTrigger(id, "crash").catch(() => {
          /* ignore rollback errors */
        });
        throw err;
      }
      sessionLogs.attachContext(id, bridge.getContext(id));
      eventBus.publish({ event: "session_resumed_from_pause", session_id: id });

      if (includeSnapshot) {
        const page = await bridge.getPage(id);
        const snapshot = await snapshotEngine.takeSnapshot(id, page, { mode: "interactive" });
        return reply.send({ session_id: id, status: "active" as const, snapshot });
      }
      return reply.send({ session_id: id, status: "active" as const });
    }
  );

  fastify.post<{ Params: { id: string } }>("/sessions/:id/commands", async (request, reply) => {
    if (isShuttingDown()) {
      throw new BrowserUnavailableError("Worker is shutting down and not accepting new commands");
    }
    const { id } = request.params;
    const rec = store.get(id);
    if (rec === undefined) {
      throw new SessionNotFoundError(id);
    }
    if (rec.status === "dead") {
      throw new SessionDeadError(id);
    }
    if (rec.status === "paused") {
      throw new SessionPausedError(id);
    }

    const parsed = CommandsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid commands body — expected { steps: [...] }");
    }

    const queue = queues.forSession(id);
    queue.tryAcquireForSession(id);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const commandId = randomUUID();
    const raw = reply.raw;

    try {
      sseWrite(raw, { event: "accepted", command_id: commandId });

      const { stepResults, streamFailed } = await executeCommandSteps(
        {
          bridge,
          snapshotEngine,
          highlightService,
          store,
          eventBus,
          governor,
          sessionLogs,
          actionLog,
          recordingService,
          config: commandConfig
        },
        id,
        parsed.data.steps,
        (payload) => {
          sseWrite(raw, payload);
        }
      );

      if (!streamFailed && !raw.writableEnded) {
        sseWrite(raw, {
          event: "completed",
          command_id: commandId,
          result: { steps: stepResults }
        });
      }
    } catch (err: unknown) {
      logger.error({ err, sessionId: id }, "command stream failed");
      if (!raw.writableEnded) {
        sseWrite(raw, {
          event: "failed",
          step: -1,
          action: "unknown",
          error: err instanceof Error ? err.message : "error",
          code: "worker.internal"
        });
      }
    } finally {
      queue.release();
      raw.end();
    }
  });

  fastify.get("/recordings", async (request, reply) => {
    const parsed = ProjectRootQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new ValidationError("Invalid query — project_root is required");
    }
    const index = await RecordingsIndexService.getAll(parsed.data.project_root);
    return reply.send({ entries: index.entries });
  });

  fastify.get<{ Params: { safeName: string } }>("/recordings/:safeName", async (request, reply) => {
    const parsed = ProjectRootQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new ValidationError("Invalid query — project_root is required");
    }
    const recordingsDir = path.join(parsed.data.project_root, ".vindicate", "recordings");
    const artifactPath = resolveProjectPath(recordingsDir, `${request.params.safeName}.json`);
    try {
      const raw = await fs.readFile(artifactPath, "utf-8");
      const artifact = RecordingArtifactSchema.parse(JSON.parse(raw));
      return reply.send(artifact);
    } catch {
      return reply.status(404).send({ error: "recording_not_found" });
    }
  });

  fastify.delete<{ Params: { safeName: string } }>(
    "/recordings/:safeName",
    async (request, reply) => {
      const parsed = ProjectRootQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid query — project_root is required");
      }
      const recordingsDir = path.join(parsed.data.project_root, ".vindicate", "recordings");
      const artifactPath = resolveProjectPath(recordingsDir, `${request.params.safeName}.json`);
      try {
        await fs.access(artifactPath);
      } catch {
        return reply.status(404).send({ error: "recording_not_found" });
      }
      await recordingService.deleteArtifact(parsed.data.project_root, request.params.safeName);
      return reply.status(200).send({ ok: true as const });
    }
  );

  fastify.patch<{ Params: { safeName: string } }>(
    "/recordings/:safeName",
    async (request, reply) => {
      const parsedQuery = ProjectRootQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        throw new ValidationError("Invalid query — project_root is required");
      }
      const parsedBody = RecordingAnnotateBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        throw new ValidationError("Invalid annotate body");
      }
      await recordingService.annotateArtifact(
        parsedQuery.data.project_root,
        request.params.safeName,
        parsedBody.data
      );
      return reply.send({ ok: true as const });
    }
  );

  fastify.post<{
    Params: { safeName: string };
    Body: {
      steps?: RecordingStep[];
      pre_conditions?: string[];
      post_conditions?: string[];
      depends_on?: string[];
      summary?: string;
    };
  }>("/recordings/:safeName/refinalize", async (request, reply) => {
    const parsedQuery = ProjectRootQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      throw new ValidationError("Invalid query — project_root is required");
    }
    const parsedBody = RecordingFinalizeBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      throw new ValidationError("Invalid recording refinalize body");
    }
    try {
      const finalized = await recordingService.refinalizeArtifact(
        parsedQuery.data.project_root,
        request.params.safeName,
        {
          ...(parsedBody.data.steps !== undefined
            ? { editedSteps: parsedBody.data.steps as unknown as RecordingStep[] }
            : {}),
          ...(parsedBody.data.pre_conditions !== undefined
            ? { pre_conditions: parsedBody.data.pre_conditions }
            : {}),
          ...(parsedBody.data.post_conditions !== undefined
            ? { post_conditions: parsedBody.data.post_conditions }
            : {}),
          ...(parsedBody.data.depends_on !== undefined
            ? { depends_on: parsedBody.data.depends_on }
            : {}),
          ...(parsedBody.data.summary !== undefined ? { summary: parsedBody.data.summary } : {})
        }
      );
      return reply.status(200).send({ ok: true, ...finalized });
    } catch {
      return reply.status(404).send({ error: "recording_not_found" });
    }
  });

  fastify.post<{
    Params: { id: string };
    Body: { name: string; started_by?: "human" | "agent"; testid_attr?: string };
  }>("/sessions/:id/recording/start", async (request, reply) => {
    const { id } = request.params;
    const parsed = RecordingStartBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError("Invalid recording start body");
    }
    const session = store.get(id);
    if (session === undefined) {
      return reply.status(404).send({ error: "session_not_found" });
    }
    if (session.status !== "active") {
      return reply.status(400).send({ error: "session_not_active" });
    }
    const startOptions: {
      testidAttr?: string;
      started_by?: "human" | "agent";
      skip_entry_navigate?: boolean;
    } = {};
    const testidAttr = parsed.data.testid_attr ?? session.testid_attr;
    if (testidAttr !== undefined) {
      startOptions.testidAttr = testidAttr;
    }
    if (parsed.data.started_by !== undefined) {
      startOptions.started_by = parsed.data.started_by;
    }
    if (parsed.data.skip_entry_navigate === true) {
      startOptions.skip_entry_navigate = true;
    }
    await recordingService.start(id, parsed.data.name, session.project_root, startOptions);
    return reply.status(200).send({ ok: true });
  });

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/recording/stop",
    async (request, reply) => {
      const { id } = request.params;
      await recordingService.stop(id);
      return reply.status(200).send({ ok: true });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/recording/snapshot",
    async (request, reply) => {
      const { id } = request.params;
      await recordingService.takeManualSnapshot(id);
      return reply.status(200).send({ ok: true });
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      steps?: RecordingStep[];
      pre_conditions?: string[];
      post_conditions?: string[];
      depends_on?: string[];
      summary?: string;
    };
  }>("/sessions/:id/recording/finalize", async (request, reply) => {
    const { id } = request.params;
    const parsed = RecordingFinalizeBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError("Invalid recording finalize body");
    }
    const session = store.get(id);
    if (session === undefined) {
      return reply.status(404).send({ error: "session_not_found" });
    }
    const finalized = await recordingService.finalize(id, {
      ...(parsed.data.steps !== undefined
        ? { editedSteps: parsed.data.steps as unknown as RecordingStep[] }
        : {}),
      ...(parsed.data.pre_conditions !== undefined
        ? { pre_conditions: parsed.data.pre_conditions }
        : {}),
      ...(parsed.data.post_conditions !== undefined
        ? { post_conditions: parsed.data.post_conditions }
        : {}),
      ...(parsed.data.depends_on !== undefined ? { depends_on: parsed.data.depends_on } : {}),
      ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {})
    });
    if (parsed.data.close_session === true) {
      await teardownSession(id);
    }
    return reply.status(200).send({ ok: true, ...finalized });
  });

  fastify.post<{ Params: { id: string }; Body: { close_session?: boolean } }>(
    "/sessions/:id/recording/discard",
    async (request, reply) => {
      const { id } = request.params;
      const parsed = RecordingDiscardBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid recording discard body");
      }
      const session = store.get(id);
      if (session === undefined) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      await recordingService.discard(id);
      if (parsed.data.close_session === true) {
        await teardownSession(id);
      }
      return reply.status(200).send({ ok: true as const });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/sessions/:id/recording/state",
    async (request, reply) => {
      const { id } = request.params;
      return reply.send(recordingService.getRecordingStateResponse(id));
    }
  );

  fastify.post<{ Params: { id: string }; Body: { recordingName: string } }>(
    "/sessions/:id/recording/playback",
    async (request, reply) => {
      const { id } = request.params;
      const parsed = RecordingPlaybackBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid playback body — recordingName is required");
      }
      const session = store.get(id);
      if (session === undefined) {
        return reply
          .status(404)
          .send({ ok: false, error: "Session not found", failedStep: 0, action: "" });
      }

      const index = await RecordingsIndexService.getAll(session.project_root);
      const entry = index.entries.find((e) => e.name === parsed.data.recordingName);
      if (entry === undefined) {
        return reply.send({ ok: false, error: "Recording not found", failedStep: 0, action: "" });
      }

      const artifactPath = path.join(
        session.project_root,
        ".vindicate",
        "recordings",
        `${entry.safe_name}.json`
      );
      let artifact;
      try {
        const raw = await fs.readFile(artifactPath, "utf-8");
        artifact = RecordingArtifactSchema.parse(JSON.parse(raw));
      } catch {
        return reply.send({
          ok: false,
          error: "Recording artifact not found",
          failedStep: 0,
          action: ""
        });
      }

      const page = await bridge.getPage(id);
      const result = await playbackRecordingSteps(
        page,
        artifact.steps,
        commandConfig,
        commandConfig.VINDICATE_ACTION_TIMEOUT_MS
      );
      return reply.send(result);
    }
  );
}

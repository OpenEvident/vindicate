/** MCP tool for browser session lifecycle and read-only cookie/storage access. */
import { UrlSchema, UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { WorkerValidationError } from "../../shared/errors.js";
import type { ICommandRunner, ISessionManager, IStorageClient } from "../../worker/worker-client.interface.js";
import type { BrowserReadSessionState } from "./browser-read-session-state.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export interface BrowserSessionToolDeps {
  readonly workerClient: ISessionManager & ICommandRunner & IStorageClient;
  /** Project root for this MCP session — where the worker stores recordings/auth. */
  readonly projectRoot: string;
  readonly browserReadState: BrowserReadSessionState;
}

const SessionActionSchema = z.enum([
  "create",
  "resume",
  "pause",
  "resume_from_pause",
  "close",
  "get_cookies",
  "get_storage"
]);

export function registerBrowserSessionTool(server: McpServer, deps: BrowserSessionToolDeps): void {
  server.registerTool(
    "browser_session",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Manage browser session lifecycle. Use action:'create' to start (requires name and url; opens headed Chrome and navigates to url), 'pause' for human handoff, 'resume_from_pause' to take back, 'close' when done. " +
        "Default create is headed (omit headless or headless:false). Pass headless:true only when the user or skill_context requests unattended/CI mode. " +
        "get_cookies/get_storage read auth state. testid_attr promotes one attribute in the auto-detected testid list.",
      inputSchema: {
        session_id: UuidSchema.optional(),
        action: SessionActionSchema,
        name: z.string().min(1).optional(),
        url: UrlSchema.optional(),
        description: z.string().optional(),
        headless: z
          .boolean()
          .optional()
          .describe("Optional. Default false (visible browser). Use true only for unattended/CI; explore nodes expect false or omit."),
        testid_attr: z.string().optional(),
        max_nodes: z.number().int().positive().optional(),
        message: z.string().min(1).optional(),
        include_snapshot: z.boolean().optional(),
        storage_type: z.enum(["local", "session"]).optional()
      }
    },
    async (args) => {
      try {
        switch (args.action) {
          case "create": {
            if (args.name === undefined || args.url === undefined) {
              return toMcpToolError(
                new WorkerValidationError(
                  "browser_session create requires name and url — provide a human-readable name and full URL with protocol"
                )
              );
            }
            const headless = args.headless ?? false;
            const result = await deps.workerClient.createSession({
              name: args.name,
              url: args.url,
              project_root: deps.projectRoot,
              ...(args.description !== undefined ? { description: args.description } : {}),
              headless,
              ...(args.testid_attr !== undefined ? { testid_attr: args.testid_attr } : {})
            });
            if (args.max_nodes !== undefined) {
              deps.browserReadState.setMaxNodes(result.session_id, args.max_nodes);
            }
            return toolJson({
              ...result,
              headless,
              ...(args.max_nodes !== undefined ? { max_nodes: args.max_nodes } : {})
            });
          }
          case "resume": {
            if (args.session_id === undefined) {
              return toMcpToolError(new Error("browser_session resume requires session_id"));
            }
            return toolJson(await deps.workerClient.resumeSession(args.session_id));
          }
          case "pause": {
            if (args.session_id === undefined || args.message === undefined) {
              return toMcpToolError(
                new Error("browser_session pause requires session_id and message describing what the human should do")
              );
            }
            const result = await deps.workerClient.runStep(args.session_id, {
              action: "pause_for_human",
              message: args.message
            });
            return toolJson(result.result);
          }
          case "resume_from_pause": {
            if (args.session_id === undefined) {
              return toMcpToolError(new Error("browser_session resume_from_pause requires session_id"));
            }
            return toolJson(
              await deps.workerClient.resumeFromPause(args.session_id, {
                ...(args.include_snapshot !== undefined
                  ? { include_snapshot: args.include_snapshot }
                  : {})
              })
            );
          }
          case "close": {
            if (args.session_id === undefined) {
              return toMcpToolError(new Error("browser_session close requires session_id"));
            }
            await deps.workerClient.closeSession(args.session_id);
            deps.browserReadState.clearSession(args.session_id);
            return toolJson({ ok: true });
          }
          case "get_cookies": {
            if (args.session_id === undefined) {
              return toMcpToolError(new Error("browser_session get_cookies requires session_id"));
            }
            return toolJson(await deps.workerClient.getCookies(args.session_id, args.url));
          }
          case "get_storage": {
            if (args.session_id === undefined) {
              return toMcpToolError(new Error("browser_session get_storage requires session_id"));
            }
            const storageType = args.storage_type ?? "local";
            return toolJson(await deps.workerClient.getStorage(args.session_id, storageType));
          }
          default: {
            const _exhaustive: never = args.action;
            return toMcpToolError(new Error(`Unsupported browser_session action: ${String(_exhaustive)}`));
          }
        }
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

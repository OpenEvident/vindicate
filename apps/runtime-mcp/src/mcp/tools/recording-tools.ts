import fs from "node:fs/promises";
import path from "node:path";

import { RecordingArtifactSchema, UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { IWorkerClient } from "../../worker/worker-client.interface.js";
import { mapRecordingError } from "../../worker/recording-error.js";
import { formatRecordingForAi } from "./recording-format.js";
import { toolJson, toolMarkdown } from "./result.js";

const RECORDING_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Optional project-root override. The project is scoped to the MCP session, so
 * this defaults to the session root and the agent normally omits it. Kept for
 * backward compatibility with callers that still pass it explicitly.
 */
const ProjectRootArg = z
  .string()
  .optional()
  .describe("Optional. Defaults to the session's project root; normally omit this.");

export interface RecordingToolDeps {
  readonly workerClient: IWorkerClient;
  /**
   * Resolved project root for this MCP session. Recordings live under
   * `<projectRoot>/.vindicate/recordings`, so this is the single source of truth —
   * the agent never has to supply it. The optional `project_root` tool argument
   * is honored for backward compatibility but defaults to this.
   */
  readonly projectRoot: string;
}

function sanitizeRecordingName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- strip control chars invalid in filenames
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "recording"
  );
}

function formatIndexMarkdown(
  entries: Array<{
    name: string;
    summary: string;
    pre_conditions: string[];
    post_conditions: string[];
    pages_covered: string[];
    depends_on: string[];
    step_count: number;
    started_by: string;
  }>
): string {
  if (entries.length === 0) {
    return "No finalized recordings found for this project.";
  }
  const lines = [
    "| Name | Steps | Started by | Summary | Pre-conditions | Post-conditions | Pages | Depends on |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- |"
  ];
  for (const entry of entries) {
    lines.push(
      `| ${entry.name} | ${entry.step_count} | ${entry.started_by} | ${entry.summary || "—"} | ${entry.pre_conditions.join("; ") || "—"} | ${entry.post_conditions.join("; ") || "—"} | ${entry.pages_covered.join(", ") || "—"} | ${entry.depends_on.join(", ") || "—"} |`
    );
  }
  return lines.join("\n");
}

async function resolveSafeName(
  workerClient: IWorkerClient,
  projectRoot: string,
  displayName: string
): Promise<string | undefined> {
  const index = await workerClient.listRecordings(projectRoot);
  return index.entries.find((entry) => entry.name === displayName)?.safe_name;
}

export function registerRecordingTools(server: McpServer, deps: RecordingToolDeps): void {
  const { workerClient, projectRoot: sessionRoot } = deps;

  server.registerTool(
    "browser_record_start",
    {
      description:
        "Start a browser recording on an active session. `mode:'human'` records and blocks until the user finalizes in VS Code (up to 30 minutes), then returns the artifact. `mode:'auto'` starts and returns immediately so the agent can drive the browser, and must be followed by `browser_record_finalize` or `browser_record_discard`.",
      inputSchema: {
        session_id: UuidSchema.describe("ID of an existing active browser session"),
        name: z.string().min(1).max(100).describe("Descriptive name for this recording"),
        mode: z.enum(["human", "auto"]).default("human")
      }
    },
    async ({ session_id, name, mode }) => {
      const started_by = mode === "human" ? "human" : "agent";
      try {
        await workerClient.startRecording(session_id, name, { started_by });
      } catch (err: unknown) {
        return toolJson(mapRecordingError(err));
      }

      if (mode === "auto") {
        return toolJson({ ok: true, session_id, name });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RECORDING_TIMEOUT_MS);

      let result: { name: string; safe_name: string; path: string } | undefined;

      const onEvent = (event: Record<string, unknown>): void => {
        if (event["event"] === "recording_finalized" && event["session_id"] === session_id) {
          result = {
            name: String(event["name"]),
            safe_name: String(event["safe_name"]),
            path: String(event["path"])
          };
          controller.abort();
        }
      };

      try {
        // Reconnect until the user finalizes (abort) or the timeout fires, so a transient stream drop
        // doesn't end the wait early. The worker replays its recent-event buffer on each (re)connect,
        // so the finalize event isn't lost across a reconnect.
        while (!controller.signal.aborted) {
          try {
            await workerClient.subscribeToWorkerEvents(onEvent, controller.signal);
          } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") {
              break;
            }
            /* transient stream error — fall through to reconnect */
          }
          if (controller.signal.aborted) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (result === undefined) {
        const safeName = sanitizeRecordingName(name);
        return toolJson({
          error: "recording_timeout",
          message: [
            "Recording timed out after 30 minutes.",
            `If the user finalized the recording, call browser_record_get with name="${name}" to retrieve it.`
          ].join(" "),
          name,
          safe_name: safeName
        });
      }

      return toolJson(result);
    }
  );

  server.registerTool(
    "browser_record_finalize",
    {
      description:
        "Finalize an in-progress auto recording. Persist `pre_conditions`, `post_conditions`, `depends_on`, and `summary` onto the saved artifact for downstream reuse.",
      inputSchema: {
        session_id: UuidSchema,
        pre_conditions: z.array(z.string()),
        post_conditions: z.array(z.string()),
        depends_on: z.array(z.string()).default([]),
        summary: z.string()
      }
    },
    async ({ session_id, pre_conditions, post_conditions, depends_on, summary }) => {
      try {
        const result = await workerClient.finalizeRecording(session_id, {
          pre_conditions,
          post_conditions,
          depends_on,
          summary
        });
        return toolJson(result);
      } catch (err: unknown) {
        return toolJson(mapRecordingError(err));
      }
    }
  );

  server.registerTool(
    "browser_record_discard",
    {
      description:
        "Discard an in-progress recording without saving. Use this when capture quality is poor or the flow changed.",
      inputSchema: {
        session_id: UuidSchema
      }
    },
    async ({ session_id }) => {
      try {
        await workerClient.discardRecording(session_id);
        return toolJson({ ok: true });
      } catch (err: unknown) {
        return toolJson(mapRecordingError(err));
      }
    }
  );

  server.registerTool(
    "browser_record_list",
    {
      description:
        "List finalized recordings for the project with names, pages covered, step counts, pre and post conditions, and dependencies. Call this first to reuse existing prerequisite flows before re-recording. Takes no arguments — the project is scoped to the MCP session.",
      inputSchema: {
        project_root: ProjectRootArg
      }
    },
    async ({ project_root }) => {
      const index = await workerClient.listRecordings(project_root ?? sessionRoot);
      return toolMarkdown(formatIndexMarkdown(index.entries));
    }
  );

  server.registerTool(
    "browser_record_read",
    {
      description:
        "Read the compact summary of one finalized recording by display name. Use this for general reference or linking prerequisite flows; right after a human-mode start completes, use `browser_record_get` instead.",
      _meta: { "anthropic/maxResultSizeChars": 8_000 },
      inputSchema: {
        name: z.string(),
        project_root: ProjectRootArg
      }
    },
    async ({ name, project_root }) => {
      const root = project_root ?? sessionRoot;
      const safeName = await resolveSafeName(workerClient, root, name);
      if (safeName === undefined) {
        return toolJson({
          error: "recording_not_found",
          message: `No recording named "${name}" found.`
        });
      }
      const artifact = await workerClient.readRecording(root, safeName);
      if (artifact === undefined) {
        return toolJson({
          error: "recording_not_found",
          message: `Recording artifact for "${name}" not found.`
        });
      }
      return toolMarkdown(formatRecordingForAi(artifact));
    }
  );

  server.registerTool(
    "browser_record_annotate",
    {
      description:
        "Write `pre_conditions`, `post_conditions`, `depends_on`, and `summary` onto a finalized human recording after capture. For auto-mode recordings, use `browser_record_finalize` instead.",
      inputSchema: {
        name: z.string(),
        project_root: ProjectRootArg,
        pre_conditions: z.array(z.string()),
        post_conditions: z.array(z.string()),
        depends_on: z.array(z.string()).default([]),
        summary: z.string()
      }
    },
    async ({ name, project_root, pre_conditions, post_conditions, depends_on, summary }) => {
      const root = project_root ?? sessionRoot;
      const safeName = await resolveSafeName(workerClient, root, name);
      if (safeName === undefined) {
        return toolJson({
          error: "recording_not_found",
          message: `No recording named "${name}" found.`
        });
      }
      await workerClient.annotateRecording(root, safeName, {
        pre_conditions,
        post_conditions,
        depends_on,
        summary
      });
      return toolJson({ ok: true });
    }
  );

  server.registerTool(
    "browser_record_get",
    {
      description:
        "Read a finalized recording immediately after a human-mode `browser_record_start` returns. Returns compact markdown suitable for codegen handoff; for general reference, use `browser_record_read`.",
      _meta: { "anthropic/maxResultSizeChars": 8_000 },
      inputSchema: {
        name: z.string().describe("Recording name as given to browser_record_start"),
        project_root: ProjectRootArg
      }
    },
    async ({ name, project_root }) => {
      const safeName = sanitizeRecordingName(name);
      const artifactPath = path.join(
        project_root ?? sessionRoot,
        ".vindicate",
        "recordings",
        `${safeName}.json`
      );
      try {
        const content = await fs.readFile(artifactPath, "utf-8");
        const parsed = RecordingArtifactSchema.safeParse(JSON.parse(content));
        if (!parsed.success) {
          const detail = parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ");
          return toolJson({
            error: "recording_invalid",
            message: `Recording at ${artifactPath} failed validation.${detail.length > 0 ? ` ${detail}` : ""}`
          });
        }
        return toolMarkdown(formatRecordingForAi(parsed.data));
      } catch {
        return toolJson({
          error: "recording_not_found",
          message: `No recording found at ${artifactPath}. Ask the user to finalize the recording in VS Code.`
        });
      }
    }
  );
}

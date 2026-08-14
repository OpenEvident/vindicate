/** MCP tool for fallback-only visual diagnosis when browser_read is insufficient. */
import { UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner } from "../../worker/worker-client.interface.js";
import type { BrowserReadSessionState } from "./browser-read-session-state.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolImage, toolMarkdown } from "./result.js";

export interface BrowserDiagnoseToolDeps {
  readonly workerClient: ICommandRunner;
  readonly browserReadState: BrowserReadSessionState;
}

interface ScreenshotWire {
  readonly image_base64: string;
  readonly mime: string;
  readonly url: string;
  readonly title: string;
  readonly scope_applied: string;
}

function isScreenshotWire(value: unknown): value is ScreenshotWire {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.image_base64 === "string" &&
    typeof r.mime === "string" &&
    typeof r.url === "string" &&
    typeof r.title === "string" &&
    typeof r.scope_applied === "string"
  );
}

function unwrapScreenshot(result: unknown): ScreenshotWire {
  if (typeof result !== "object" || result === null) {
    throw new Error("browser_diagnose received invalid screenshot result — retry after browser_read");
  }
  const record = result as Record<string, unknown>;
  if (record.action === "screenshot") {
    const rest = { ...record };
    delete rest.action;
    if (!isScreenshotWire(rest)) {
      throw new Error("browser_diagnose screenshot missing image_base64, url, or title — retry");
    }
    return rest;
  }
  if (!isScreenshotWire(record)) {
    throw new Error("browser_diagnose screenshot missing image_base64, url, or title — retry");
  }
  return record;
}

export function registerBrowserDiagnoseTool(server: McpServer, deps: BrowserDiagnoseToolDeps): void {
  server.registerTool(
    "browser_diagnose",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Fallback only. After a `browser_read` you still cannot locate or act on the target, capture a screenshot to diagnose why (modal blocking, disabled control, element needs a prior step). Use the default viewport shot for missing or blocked elements — element scope waits for visibility and may time out. Diagnosis only — never to author a selector. One shot per stuck-point.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        session_id: UuidSchema,
        scope: z
          .union([z.object({ ref: z.string() }), z.object({ css: z.string() })])
          .optional(),
        full_page: z.boolean().optional()
      }
    },
    async (args) => {
      try {
        if (deps.browserReadState.getLastSnapshotId(args.session_id) === undefined) {
          return toolMarkdown(
            "Call `browser_read` first — `browser_diagnose` is a fallback after a read. Capture the page snapshot and refs before requesting a visual diagnosis."
          );
        }

        const step: Record<string, unknown> = { action: "screenshot" };
        if (args.scope !== undefined) {
          step.scope = args.scope;
        }
        if (args.full_page !== undefined) {
          step.full_page = args.full_page;
        }

        const stepResult = await deps.workerClient.runStep(args.session_id, step);
        const shot = unwrapScreenshot(stepResult.result);
        const header = `${shot.url} · ${shot.title} · ${shot.scope_applied}`;
        return toolImage(shot.image_base64, shot.mime, header);
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

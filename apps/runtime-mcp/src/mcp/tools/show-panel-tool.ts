/**
 * @file vindicate_show_panel — inline data panels (no cloud fetch).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { APP_RESOURCE_URI } from "../resources/vindicate-app-resource.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export function registerShowPanelTool(server: McpServer): void {
  registerAppTool(
    server,
    "vindicate_show_panel",
    {
      description:
        "Opens a visual results panel. Pass panel data inline — reopen panels on demand. " +
        "Use workflow-complete for audit summaries, coverage for gap analysis, refactor-metrics for refactor stats.",
      inputSchema: {
        panel_type: z.enum(["workflow-complete", "coverage", "refactor-metrics"]),
        data: z.record(z.string(), z.unknown())
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI } }
    },
    (args) => {
      try {
        return toolJson({ view: args.panel_type, ...args.data });
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

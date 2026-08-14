/** MCP tool for navigation, new tabs, tab close, and URL-pattern tab switching. */
import { UrlSchema, UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner } from "../../worker/worker-client.interface.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export function registerBrowserNavigateTool(server: McpServer, workerClient: ICommandRunner): void {
  server.registerTool(
    "browser_navigate",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Navigate to a URL, or wait for page load after a click. Omit url to wait for navigation triggered by a preceding click (defaults to 'load'; use wait_until:'networkidle' for AJAX-heavy pages). Use new_tab:true to open in a new tab. Use switch_to_url to focus an existing tab by URL substring. Use close_tab:true to close the active tab.",
      inputSchema: {
        session_id: UuidSchema,
        url: UrlSchema.optional(),
        wait_until: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
        new_tab: z.boolean().optional(),
        close_tab: z.boolean().optional(),
        switch_to_url: z.string().min(1).optional()
      }
    },
    async (args) => {
      try {
        if (args.close_tab === true) {
          const result = await workerClient.runStep(args.session_id, { action: "close_tab" });
          return toolJson(result.result, "browser_navigate");
        }

        if (args.new_tab === true) {
          const result = await workerClient.runStep(args.session_id, {
            action: "new_tab",
            ...(args.url !== undefined ? { url: args.url } : {})
          });
          return toolJson(result.result, "browser_navigate");
        }

        const urlPattern = args.switch_to_url ?? args.url;
        if (urlPattern !== undefined && args.url === undefined) {
          const result = await workerClient.runStep(args.session_id, {
            action: "switch_tab_by_url",
            url_pattern: urlPattern
          });
          return toolJson(result.result, "browser_navigate");
        }

        if (args.url === undefined) {
          const result = await workerClient.runStep(args.session_id, {
            action: "wait_for_load_state",
            ...(args.wait_until !== undefined ? { state: args.wait_until } : {})
          });
          return toolJson(result.result, "browser_navigate");
        }

        if (args.wait_until === undefined) {
          try {
            const switched = await workerClient.runStep(args.session_id, {
              action: "switch_tab_by_url",
              url_pattern: args.url
            });
            return toolJson(switched.result, "browser_navigate");
          } catch (switchErr: unknown) {
            const msg = switchErr instanceof Error ? switchErr.message : "";
            if (!msg.includes("No tab found matching URL pattern")) {
              return toMcpToolError(switchErr);
            }
          }
        }

        const result = await workerClient.runStep(args.session_id, {
          action: "navigate",
          url: args.url,
          ...(args.wait_until !== undefined ? { wait_for: args.wait_until } : {})
        });
        return toolJson(result.result, "browser_navigate");
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

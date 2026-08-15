/** MCP tool for post-action assertions and structured value extraction from page state. */
import { UuidSchema } from "@vindicate/protocol";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ICommandRunner } from "../../worker/worker-client.interface.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export function registerBrowserAssertTool(server: McpServer, workerClient: ICommandRunner): void {
  server.registerTool(
    "browser_assert",
    {
      description:
        "One browser tool at a time per session — parallel calls return session busy. Verify page state after an action and capture alert or status messages. Use `expect` for pass/fail checks and `extract` to pull structured values by name. Both inputs are optional; calling with neither returns current alert state only.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        session_id: UuidSchema,
        expect: z.string().optional(),
        extract: z
          .record(z.string(), z.enum(["string", "string | null", "boolean", "number | null"]))
          .optional()
      }
    },
    async (args) => {
      try {
        const step: Record<string, unknown> = { action: "assert" };
        if (args.expect !== undefined) {
          step.expect = args.expect;
        }
        if (args.extract !== undefined) {
          step.extract = args.extract;
        }
        const result = await workerClient.runStep(args.session_id, step);
        return toolJson(result.result, "browser_assert");
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

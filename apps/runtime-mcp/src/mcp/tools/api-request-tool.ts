/** MCP tool for a single, stateless HTTP request — the API-automation fallback/gap-filler
 * (mirrors browser_diagnose's role for UI: never a proactive step, only used when information is
 * genuinely missing during grounding, or to diagnose a real test failure). */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { API_REQUEST_BODY_TYPES, API_REQUEST_METHODS } from "../../worker/worker-client.interface.js";
import type { ApiRequestParams, IApiRequestClient } from "../../worker/worker-client.interface.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export interface ApiRequestToolDeps {
  readonly workerClient: IApiRequestClient;
}

const ApiRequestArgsSchema = z.object({
  method: z.enum(API_REQUEST_METHODS),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  body_type: z
    .enum(API_REQUEST_BODY_TYPES)
    .optional()
    .describe("Required when body is provided. 'json' for a JSON body, 'form' for x-www-form-urlencoded."),
  params: z.record(z.string(), z.string()).optional().describe("Query string parameters."),
  timeout_ms: z.number().int().positive().optional()
});

/** Narrows the zod-parsed args (whose optional fields are `T | undefined`) down to
 * `ApiRequestParams` (`exactOptionalPropertyTypes`-compatible — optional keys must be entirely
 * absent, never present-with-`undefined`). */
function toApiRequestParams(args: z.infer<typeof ApiRequestArgsSchema>): ApiRequestParams {
  return {
    method: args.method,
    url: args.url,
    ...(args.headers !== undefined ? { headers: args.headers } : {}),
    ...(args.body !== undefined ? { body: args.body } : {}),
    ...(args.body_type !== undefined ? { body_type: args.body_type } : {}),
    ...(args.params !== undefined ? { params: args.params } : {}),
    ...(args.timeout_ms !== undefined ? { timeout_ms: args.timeout_ms } : {})
  };
}

export function registerApiRequestTool(server: McpServer, deps: ApiRequestToolDeps): void {
  server.registerTool(
    "api_request",
    {
      description:
        "Fallback only — sends one real HTTP request and returns the live status/headers/body. " +
        "Never a proactive step: only call this when information is genuinely missing (the user's " +
        "OpenAPI/Postman/curl/description doesn't fully specify a response shape) during grounding, " +
        "or to diagnose why a generated API test actually failed. When the user already gave complete " +
        "information, ground and generate directly from it instead — the real verification happens " +
        "when the generated test runs. A 4xx/5xx response is a normal result, not a tool failure.",
      annotations: { readOnlyHint: true },
      inputSchema: ApiRequestArgsSchema.shape
    },
    async (args) => {
      try {
        const result = await deps.workerClient.apiRequest(toApiRequestParams(args));
        return toolJson(result, "api_request");
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

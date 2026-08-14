/**
 * @file GET /capabilities — advertised worker operations.
 */
import { PROTOCOL_VERSION, WorkerCapabilitiesResponseSchema } from "@vindicate/protocol";
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

const BROWSER_ACTIONS = [
  "navigate",
  "snapshot",
  "screenshot",
  "click",
  "type",
  "fill",
  "dblclick",
  "drag",
  "select_option",
  "hover",
  "check",
  "uncheck",
  "wait_for_response",
  "wait_for_load_state",
  "press_key",
  "scroll_by",
  "upload_file",
  "resolve_target",
  "assert",
  "get_cookies",
  "set_cookies",
  "clear_cookies",
  "get_storage",
  "set_storage",
  "clear_storage",
  "pause_for_human",
  "new_tab",
  "switch_tab",
  "switch_tab_by_url",
  "close_tab",
  "handle_dialog"
] as const;

const BROWSER_COMING_SOON = [] as const;

const FILE_OPS = ["read", "write", "list", "delete"] as const;

export function registerCapabilitiesRoutes<L extends FastifyBaseLogger>(
  fastify: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>
): void {
  fastify.get("/capabilities", (_request, reply) => {
    const body = WorkerCapabilitiesResponseSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      browser: {
        actions: [...BROWSER_ACTIONS],
        coming_soon: [...BROWSER_COMING_SOON]
      },
      files: { operations: [...FILE_OPS] }
    });
    return reply.send(body);
  });
}

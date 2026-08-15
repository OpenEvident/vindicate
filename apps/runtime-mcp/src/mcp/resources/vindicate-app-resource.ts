/**
 * @file MCP App resource — single HTML bundle for all Vindicate UI views.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

export const APP_RESOURCE_URI = "ui://vindicate/app.html";

// Resolved relative to this file in dev (src/mcp/resources/) and relative to
// the copied bundle in production (dist/bundled/runtime-mcp/vindicate-ui.html).
const APP_HTML_PATH = existsSync(join(import.meta.dirname, "vindicate-ui.html"))
  ? join(import.meta.dirname, "vindicate-ui.html")
  : join(import.meta.dirname, "../../../../vindicate-ui/dist/index.html");

let cachedHtml: string | undefined;

function getAppHtml(): string {
  if (cachedHtml !== undefined) {
    return cachedHtml;
  }
  if (!existsSync(APP_HTML_PATH)) {
    throw new Error(
      `Vindicate UI bundle not found at ${APP_HTML_PATH}. Run: pnpm --filter @vindicate/vindicate-ui build`
    );
  }
  cachedHtml = readFileSync(APP_HTML_PATH, "utf-8");
  return cachedHtml;
}

export function registerVindicateAppResource(server: McpServer): void {
  registerAppResource(
    server,
    "vindicate_app",
    APP_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    () => ({
      contents: [
        {
          uri: APP_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: getAppHtml()
        }
      ]
    })
  );
}

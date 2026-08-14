/**
 * @file MCP Apps client capability detection.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getUiCapability,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";

type UiCapabilityInput = Parameters<typeof getUiCapability>[0];

export type ProgressDisplayMode = "mcp_app" | "markdown_in_chat";

export interface ProgressDisplay {
  readonly mode: ProgressDisplayMode;
  readonly instruction: string;
}

function isUiCapabilityInput(value: unknown): value is UiCapabilityInput {
  return typeof value === "object" && value !== null;
}

export function checkAppsCapability(server: McpServer): boolean {
  const underlying = server.server as {
    getClientCapabilities?: () => unknown;
  };
  const caps = underlying.getClientCapabilities?.();
  if (!isUiCapabilityInput(caps)) {
    return false;
  }
  const uiCapUnknown: unknown = getUiCapability(caps);
  if (typeof uiCapUnknown !== "object" || uiCapUnknown === null) {
    return false;
  }
  const mimeTypes = (uiCapUnknown as { mimeTypes?: unknown }).mimeTypes;
  return Array.isArray(mimeTypes) && mimeTypes.includes(RESOURCE_MIME_TYPE);
}

/** Explicit per-response instruction — server detects MCP Apps UI from client capabilities. */
export function buildProgressDisplay(appsPanelSupported: boolean): ProgressDisplay {
  if (appsPanelSupported) {
    return {
      mode: "mcp_app",
      instruction:
        "Do not post workflow progress in chat — this client renders the workflow-progress MCP App panel from this tool result."
    };
  }
  return {
    mode: "markdown_in_chat",
    instruction:
      "Post the markdown_panel field verbatim in your next user-visible message — this client does not render MCP App panels."
  };
}

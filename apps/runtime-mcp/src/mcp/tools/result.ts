/**
 * @file Helpers for MCP tool call results.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { applyResponseBudget } from "../response-budget.js";

/** Structured JSON result — for tools where the agent needs to extract typed values. */
export function toolJson(
  data: unknown,
  toolName?: string,
  options?: { compact?: boolean }
): CallToolResult {
  const payload = toolName === undefined ? data : applyResponseBudget(toolName, data);
  const compact = options?.compact === true;
  return {
    content: [{ type: "text", text: compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2) }]
  };
}

/** Markdown result — for tools where the output is primarily for human display.
 *  Renders with full markdown in Cursor's chat panel. */
export function toolMarkdown(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }]
  };
}

/** Image + thin text header — for visual diagnosis tools. Never passes through applyResponseBudget. */
export function toolImage(imageBase64: string, mimeType: string, header: string): CallToolResult {
  return {
    content: [
      { type: "image", data: imageBase64, mimeType },
      { type: "text", text: header }
    ]
  };
}

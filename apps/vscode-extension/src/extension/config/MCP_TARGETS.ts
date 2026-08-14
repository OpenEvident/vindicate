import path from "node:path";

export interface McpTarget {
  name: string;
  configPath: string;
  format: "mcpServers" | "servers";
  serverKey: string;
  serverValue: Record<string, unknown>;
}

const MCP_URL = "http://127.0.0.1:9223/mcp";
// Header name must match runtime-mcp's getProjectRootHeader (mcp-http-sessions.ts).
const PROJECT_ROOT_HEADER = "x-vindicate-project-root";

/**
 * Project-level MCP targets — paths are relative to the workspace folder.
 * These should be committed to source control so the whole team gets MCP
 * configured automatically on clone.
 *
 * Each entry carries an `x-vindicate-project-root` header so the single shared
 * runtime-mcp server (fixed port :9223) scopes this workspace's file I/O, test
 * runs, and recordings to *this* folder — even when another VS Code window /
 * IDE already spawned the server from a different folder.
 *
 * Returns an empty array when folderPath is null (no workspace open).
 */
export function buildProjectMcpTargets(folderPath: string): McpTarget[] {
  // Identity travels in the URL query string — every MCP client connects to the
  // configured `url` verbatim, so the server always receives it. The header is a
  // secondary channel; some clients don't forward custom headers (Claude Code
  // issue #14977). The server reads the query first, then the header.
  const url = `${MCP_URL}?project_root=${encodeURIComponent(folderPath)}`;
  const headers = { [PROJECT_ROOT_HEADER]: folderPath };
  // Cursor's legacy { url } entry also accepts a headers map.
  const urlValue = { url, headers };
  // Claude Code and VS Code require an explicit type field for URL-based servers.
  const httpValue = { type: "http", url, headers };
  // Antigravity requires `serverUrl`, not `url`/`httpUrl` (both documented as unsupported legacy
  // fields) — confirmed against antigravity.google/docs/mcp. Deliberately omits `headers`: a
  // confirmed, unfixed Antigravity bug (google-antigravity/antigravity-cli#71) makes every tool call
  // fail outright when a `headers` block is present on a `serverUrl` entry. Not a functional loss —
  // `project_root` already travels in the URL query string above, which every target already relies
  // on as the primary channel since not all clients forward custom headers reliably.
  const antigravityValue = { serverUrl: url };
  return [
    {
      name: "VS Code",
      configPath: path.join(folderPath, ".vscode", "mcp.json"),
      format: "servers",
      serverKey: "Vindicate",
      serverValue: httpValue
    },
    {
      name: "Cursor",
      configPath: path.join(folderPath, ".cursor", "mcp.json"),
      format: "mcpServers",
      serverKey: "Vindicate",
      serverValue: urlValue
    },
    {
      name: "Claude Code",
      configPath: path.join(folderPath, ".mcp.json"),
      format: "mcpServers",
      serverKey: "Vindicate",
      serverValue: httpValue
    },
    {
      name: "Antigravity",
      configPath: path.join(folderPath, ".agents", "mcp_config.json"),
      format: "mcpServers",
      serverKey: "Vindicate",
      serverValue: antigravityValue
    }
  ];
}

/**
 * All applicable MCP targets for the given context. Empty when no folderPath
 * is provided — all current targets are project-level.
 */
export function buildMcpTargets(folderPath?: string | null): McpTarget[] {
  return folderPath ? buildProjectMcpTargets(folderPath) : [];
}

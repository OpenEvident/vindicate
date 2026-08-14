import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import {
  buildProgressDisplay,
  checkAppsCapability
} from "../../src/mcp/apps-capability.js";

function stubClientCaps(server: McpServer, caps: unknown): void {
  (server.server as { getClientCapabilities?: () => unknown }).getClientCapabilities = () => caps;
}

describe("apps-capability", () => {
  it("detects MCP Apps UI when client advertises the ui extension mime type", () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    stubClientCaps(server, {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: [RESOURCE_MIME_TYPE]
        }
      }
    });
    expect(checkAppsCapability(server)).toBe(true);
  });

  it("returns false when client caps are missing or incomplete", () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    expect(checkAppsCapability(server)).toBe(false);
    stubClientCaps(server, { ui: { mimeTypes: [RESOURCE_MIME_TYPE] } });
    expect(checkAppsCapability(server)).toBe(false);
  });

  it("buildProgressDisplay instructions match mode", () => {
    expect(buildProgressDisplay(true).mode).toBe("mcp_app");
    expect(buildProgressDisplay(true).instruction).toContain("Do not post");
    expect(buildProgressDisplay(false).mode).toBe("markdown_in_chat");
    expect(buildProgressDisplay(false).instruction).toContain("markdown_panel");
  });
});

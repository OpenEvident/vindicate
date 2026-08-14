import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerDesignTool } from "../../src/mcp/tools/design-tool.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}>;

function getToolHandler(server: McpServer, name: string): ToolHandler {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> })
    ._registeredTools;
  const tool = tools[name];
  if (tool === undefined) {
    throw new Error(`tool not registered: ${name}`);
  }
  return tool.handler;
}

function textFromResult(result: Awaited<ReturnType<ToolHandler>>): string {
  const block = result.content[0];
  return block !== undefined && block.type === "text" && block.text !== undefined ? block.text : "";
}

describe("design-tool", () => {
  it("returns design-approval with all cases added when no previous", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerDesignTool(server);

    const result = await getToolHandler(server, "vindicate_design")({
      suites: [
        {
          title: "Auth",
          cases: [{ title: "should sign in" }]
        }
      ],
      write_plan: "Create login spec"
    });

    const body = JSON.parse(textFromResult(result)) as {
      view: string;
      suites: unknown[];
      write_plan: string;
      badges: Record<string, string>;
    };
    expect(body.view).toBe("design-approval");
    expect(body.write_plan).toBe("Create login spec");
    expect(body.badges["should sign in"]).toBe("added");
  });

  it("diffs previous suites for modified and removed badges", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerDesignTool(server);

    const result = await getToolHandler(server, "vindicate_design")({
      previous: {
        suites: [
          {
            title: "Auth",
            cases: [{ title: "should sign in" }, { title: "should sign out" }]
          }
        ]
      },
      suites: [
        {
          title: "Auth",
          cases: [{ title: "should log in with email" }, { title: "should sign out" }]
        }
      ]
    });

    const body = JSON.parse(textFromResult(result)) as { badges: Record<string, string> };
    expect(body.badges["should sign in"]).toBe("removed");
    expect(body.badges["should log in with email"]).toBe("modified");
    expect(body.badges["should sign out"]).toBeUndefined();
  });
});

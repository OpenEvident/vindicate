import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerShowPanelTool } from "../../src/mcp/tools/show-panel-tool.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}>;

function getToolHandler(server: McpServer, name: string): ToolHandler {
  const tools = (
    server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> }
  )._registeredTools;
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

describe("show-panel-tool", () => {
  it("returns inline coverage panel data", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerShowPanelTool(server);

    const result = await getToolHandler(
      server,
      "vindicate_show_panel"
    )({
      panel_type: "coverage",
      data: {
        total_tests: 12,
        suite_count: 3,
        coverage_gaps: 2,
        features: [{ name: "auth", status: "covered", test_count: 4 }]
      }
    });

    const body = JSON.parse(textFromResult(result)) as {
      view: string;
      total_tests: number;
      features: unknown[];
    };
    expect(body.view).toBe("coverage");
    expect(body.total_tests).toBe(12);
    expect(body.features).toHaveLength(1);
  });

  it("returns workflow-complete panel with merged data", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerShowPanelTool(server);

    const result = await getToolHandler(
      server,
      "vindicate_show_panel"
    )({
      panel_type: "workflow-complete",
      data: {
        verdict: "pass",
        tests_written: 5,
        next_action: "Run smoke tests"
      }
    });

    const body = JSON.parse(textFromResult(result)) as {
      view: string;
      verdict: string;
      tests_written: number;
    };
    expect(body.view).toBe("workflow-complete");
    expect(body.verdict).toBe("pass");
    expect(body.tests_written).toBe(5);
  });
});

import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ProjectFs } from "../../src/fs/project-fs.js";
import { registerScaffoldTools } from "../../src/mcp/tools/scaffold-tools.js";
import { scaffoldProject } from "../../src/harness/scaffold-project.js";

vi.mock("../../src/harness/scaffold-project.js", () => ({
  scaffoldProject: vi.fn(async () => ({
    filesCreated: ["package.json"],
    skipped: [],
    structure_valid: true as const
  }))
}));

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

describe("scaffold-tools", () => {
  it("returns an agent-friendly error when ci_platform is missing", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerScaffoldTools(server, new ProjectFs({ projectRoot: process.cwd(), maxFileBytes: 512_000 }));

    const result = await getToolHandler(server, "scaffold_project")({
      base_url: "https://app.example.com"
    });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toContain("scaffold_project requires ci_platform");
    expect(textFromResult(result)).toContain("github, bitbucket");
    expect(textFromResult(result)).toContain("vindicate_ask_user");
  });

  it("forwards target to scaffoldProject when provided", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerScaffoldTools(server, new ProjectFs({ projectRoot: process.cwd(), maxFileBytes: 512_000 }));

    await getToolHandler(server, "scaffold_project")({
      base_url: "https://app.example.com",
      ci_platform: "github",
      target: "api"
    });

    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ target: "api" })
    );
  });

  it("returns an agent-friendly error when target is missing", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerScaffoldTools(server, new ProjectFs({ projectRoot: process.cwd(), maxFileBytes: 512_000 }));

    const result = await getToolHandler(server, "scaffold_project")({
      base_url: "https://app.example.com",
      ci_platform: "github"
    });

    expect(result.isError).toBe(true);
    expect(textFromResult(result)).toContain("scaffold_project requires target");
    expect(textFromResult(result)).toContain("ui, api, both");
    expect(textFromResult(result)).toContain("vindicate_ask_user");
  });
});

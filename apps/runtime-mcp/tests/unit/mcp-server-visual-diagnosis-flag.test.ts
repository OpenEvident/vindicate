import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { config } from "../../src/core/config.js";
import { ContentService } from "../../src/content/content-service.js";
import { createVindicateMcpServer } from "../../src/mcp/mcp-server.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

vi.mock("../../src/mcp/tools/browser-session-tool.js", () => ({
  registerBrowserSessionTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-navigate-tool.js", () => ({
  registerBrowserNavigateTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-act-tool.js", () => ({
  registerBrowserActTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-read-tool.js", () => ({
  registerBrowserReadTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-diagnose-tool.js", () => ({
  registerBrowserDiagnoseTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-assert-tool.js", () => ({
  registerBrowserAssertTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/generate-code-tool.js", () => ({
  registerGenerateCodeTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/validate-story-tool.js", () => ({
  registerValidateStoryTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/test-tool.js", () => ({
  registerTestTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/scaffold-tools.js", () => ({
  registerScaffoldTools: vi.fn()
}));
vi.mock("../../src/mcp/tools/recording-tools.js", () => ({
  registerRecordingTools: vi.fn()
}));
vi.mock("../../src/mcp/tools/ask-user-tool.js", () => ({
  registerAskUserTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/design-tool.js", () => ({
  registerDesignTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/show-panel-tool.js", () => ({
  registerShowPanelTool: vi.fn()
}));
vi.mock("../../src/mcp/resources/elicitation-resources.js", () => ({
  registerElicitationResources: vi.fn()
}));
vi.mock("../../src/mcp/resources/vindicate-app-resource.js", () => ({
  registerVindicateAppResource: vi.fn()
}));
vi.mock("../../src/mcp/prompts/slash-prompts.js", () => ({
  registerSlashPrompts: vi.fn()
}));
vi.mock("../../src/mcp/tools/workflow-tool.js", () => ({
  registerWorkflowTool: vi.fn()
}));

import { registerBrowserDiagnoseTool } from "../../src/mcp/tools/browser-diagnose-tool.js";

describe("VINDICATE_VISUAL_DIAGNOSIS gate", () => {
  it("skips browser_diagnose registration when flag is false", () => {
    vi.mocked(registerBrowserDiagnoseTool).mockClear();
    const workerClient = new FakeWorkerClient();
    const contentService = new ContentService({ projectRoot: config.VINDICATE_PROJECT_ROOT });

    const { server } = createVindicateMcpServer({
      config: { ...config, VINDICATE_VISUAL_DIAGNOSIS: false },
      workerClient,
      makeContentService: () => contentService,
      projectRoot: config.VINDICATE_PROJECT_ROOT,
      progressNotifier: vi.fn()
    });

    expect(server).toBeInstanceOf(McpServer);
    expect(registerBrowserDiagnoseTool).not.toHaveBeenCalled();
  });
});

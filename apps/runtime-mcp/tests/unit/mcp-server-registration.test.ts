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
vi.mock("../../src/mcp/tools/browser-fill-form-tool.js", () => ({
  registerBrowserFillFormTool: vi.fn()
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

import { registerBrowserActTool } from "../../src/mcp/tools/browser-act-tool.js";
import { registerBrowserAssertTool } from "../../src/mcp/tools/browser-assert-tool.js";
import { registerBrowserFillFormTool } from "../../src/mcp/tools/browser-fill-form-tool.js";
import { registerBrowserDiagnoseTool } from "../../src/mcp/tools/browser-diagnose-tool.js";
import { registerBrowserNavigateTool } from "../../src/mcp/tools/browser-navigate-tool.js";
import { registerBrowserReadTool } from "../../src/mcp/tools/browser-read-tool.js";
import { registerBrowserSessionTool } from "../../src/mcp/tools/browser-session-tool.js";
import { registerGenerateCodeTool } from "../../src/mcp/tools/generate-code-tool.js";
import { registerValidateStoryTool } from "../../src/mcp/tools/validate-story-tool.js";
import { registerScaffoldTools } from "../../src/mcp/tools/scaffold-tools.js";
import { registerRecordingTools } from "../../src/mcp/tools/recording-tools.js";
import { registerAskUserTool } from "../../src/mcp/tools/ask-user-tool.js";
import { registerDesignTool } from "../../src/mcp/tools/design-tool.js";
import { registerShowPanelTool } from "../../src/mcp/tools/show-panel-tool.js";
import { registerTestTool } from "../../src/mcp/tools/test-tool.js";
import { registerElicitationResources } from "../../src/mcp/resources/elicitation-resources.js";
import { registerVindicateAppResource } from "../../src/mcp/resources/vindicate-app-resource.js";
import { registerWorkflowTool } from "../../src/mcp/tools/workflow-tool.js";
import { registerSlashPrompts } from "../../src/mcp/prompts/slash-prompts.js";

describe("createVindicateMcpServer", () => {
  it("wires all tool and resource registrars", () => {
    const workerClient = new FakeWorkerClient();
    const contentService = new ContentService({ projectRoot: config.VINDICATE_PROJECT_ROOT });

    const { server, progressBridge } = createVindicateMcpServer({
      config,
      workerClient,
      makeContentService: () => contentService,
      projectRoot: config.VINDICATE_PROJECT_ROOT,
      progressNotifier: vi.fn()
    });

    expect(server).toBeInstanceOf(McpServer);
    expect(progressBridge).toBeDefined();
    expect(registerBrowserSessionTool).toHaveBeenCalledOnce();
    expect(registerBrowserNavigateTool).toHaveBeenCalledOnce();
    expect(registerBrowserActTool).toHaveBeenCalledOnce();
    expect(registerBrowserFillFormTool).toHaveBeenCalledOnce();
    expect(registerBrowserReadTool).toHaveBeenCalledOnce();
    expect(registerBrowserDiagnoseTool).toHaveBeenCalledOnce();
    expect(registerBrowserAssertTool).toHaveBeenCalledOnce();
    expect(registerGenerateCodeTool).toHaveBeenCalledOnce();
    expect(registerValidateStoryTool).toHaveBeenCalledOnce();
    expect(registerScaffoldTools).toHaveBeenCalledOnce();
    expect(registerTestTool).toHaveBeenCalledOnce();
    expect(registerRecordingTools).toHaveBeenCalledOnce();
    expect(registerWorkflowTool).toHaveBeenCalledOnce();
    expect(registerAskUserTool).toHaveBeenCalledOnce();
    expect(registerDesignTool).toHaveBeenCalledOnce();
    expect(registerShowPanelTool).toHaveBeenCalledOnce();
    expect(registerElicitationResources).toHaveBeenCalledOnce();
    expect(registerVindicateAppResource).toHaveBeenCalledOnce();
    expect(registerSlashPrompts).toHaveBeenCalledOnce();
  });
});

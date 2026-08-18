/**
 * @file MCP server factory — registers all tools and resources.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { logger } from "../core/logger.js";
import type { Config } from "../core/config.js";
import { ProjectFs } from "../fs/project-fs.js";
import type { IWorkerClient } from "../worker/worker-client.interface.js";
import { ProgressBridge, type ProgressNotifier } from "./progress.js";
import { registerElicitationResources } from "./resources/elicitation-resources.js";
import { registerVindicateAppResource } from "./resources/vindicate-app-resource.js";
import { registerSlashPrompts } from "./prompts/slash-prompts.js";
import { registerApiRequestTool } from "./tools/api-request-tool.js";
import { registerApproveStoryTool } from "./tools/approve-story-tool.js";
import { registerAskUserTool } from "./tools/ask-user-tool.js";
import { registerBrowserActTool } from "./tools/browser-act-tool.js";
import { registerBrowserAssertTool } from "./tools/browser-assert-tool.js";
import { registerBrowserDiagnoseTool } from "./tools/browser-diagnose-tool.js";
import { registerBrowserFillFormTool } from "./tools/browser-fill-form-tool.js";
import { registerBrowserNavigateTool } from "./tools/browser-navigate-tool.js";
import { BrowserReadSessionState } from "./tools/browser-read-session-state.js";
import { registerBrowserReadTool } from "./tools/browser-read-tool.js";
import { registerBrowserSessionTool } from "./tools/browser-session-tool.js";
import { registerDesignTool } from "./tools/design-tool.js";
import { registerScaffoldTools } from "./tools/scaffold-tools.js";
import { registerGenerateCodeTool } from "./tools/generate-code-tool.js";
import { registerRecordingTools } from "./tools/recording-tools.js";
import { registerShowPanelTool } from "./tools/show-panel-tool.js";
import { registerTestTool } from "./tools/test-tool.js";
import { registerValidateStoryTool } from "./tools/validate-story-tool.js";

import type { IContentService } from "../content/content-service.interface.js";
import { registerWorkflowTool } from "./tools/workflow-tool.js";

const SERVER_INSTRUCTIONS = `Vindicate automates Playwright browser testing. Use Vindicate tools when the user wants to write, fix, run, or manage tests — not for general coding or informational questions.

For any test-automation work, call vindicate_workflow first (returns a progress panel + phase steps). Pass path once started; on each phase change pass node, from, and completed (finished node ids). Copy progress_echo from every response into the next call. Use vindicate_generate_code mode create only for new features; edit existing .ts files directly for other changes. Never invent selectors — capture them with browser_read.

Browser tools require browser_session action:'create' first. Default is headed (omit headless); use headless:true only when the user or workflow guidance asks for unattended mode. Ask one question at a time via vindicate_ask_user when you need a structured mid-task choice.`;

export interface McpServerFactoryDeps {
  readonly config: Config;
  readonly workerClient: IWorkerClient;
  /**
   * Builds a content service bound to a specific project root. Called once per
   * MCP session so each connected workspace reads its own `.vindicate/config.json`.
   */
  readonly makeContentService: (projectRoot: string) => IContentService;
}

export interface McpServerDeps extends McpServerFactoryDeps {
  readonly progressNotifier: ProgressNotifier;
  /**
   * Resolved project root for this session (from the client's
   * `x-vindicate-project-root` header, falling back to `VINDICATE_PROJECT_ROOT`).
   * All file I/O, test runs, and recordings for the session are scoped here.
   */
  readonly projectRoot: string;
}

export function createVindicateMcpServer(deps: McpServerDeps): {
  server: McpServer;
  progressBridge: ProgressBridge;
} {
  const mcp = new McpServer(
    { name: "vindicate", version: "0.0.0" },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true }
      },
      instructions: SERVER_INSTRUCTIONS
    }
  );

  const progressBridge = new ProgressBridge(deps.progressNotifier);
  const projectRoot = deps.projectRoot;
  const contentService = deps.makeContentService(projectRoot);
  const projectFs = new ProjectFs({
    projectRoot,
    ...(deps.config.CLAUDE_PROJECT_DIR !== undefined
      ? { claudeProjectDir: deps.config.CLAUDE_PROJECT_DIR }
      : {}),
    maxFileBytes: deps.config.VINDICATE_MAX_FILE_BYTES
  });

  const browserReadState = new BrowserReadSessionState();
  registerBrowserSessionTool(mcp, {
    workerClient: deps.workerClient,
    projectRoot,
    browserReadState
  });
  registerBrowserNavigateTool(mcp, deps.workerClient);
  registerBrowserActTool(mcp, deps.workerClient);
  registerBrowserFillFormTool(mcp, deps.workerClient);
  registerBrowserReadTool(mcp, {
    workerClient: deps.workerClient,
    browserReadState
  });
  if (deps.config.VINDICATE_VISUAL_DIAGNOSIS) {
    registerBrowserDiagnoseTool(mcp, {
      workerClient: deps.workerClient,
      browserReadState
    });
  }
  registerBrowserAssertTool(mcp, deps.workerClient);
  registerApiRequestTool(mcp, { workerClient: deps.workerClient });
  registerGenerateCodeTool(mcp, projectFs);
  registerValidateStoryTool(mcp, projectFs);
  registerApproveStoryTool(mcp, projectFs);
  registerScaffoldTools(mcp, projectFs);
  registerTestTool(mcp, projectRoot);
  registerRecordingTools(mcp, { workerClient: deps.workerClient, projectRoot });
  registerWorkflowTool(mcp, contentService);
  registerAskUserTool(mcp);
  registerDesignTool(mcp);
  registerShowPanelTool(mcp);
  registerElicitationResources(mcp);
  registerVindicateAppResource(mcp);
  registerSlashPrompts(mcp);

  logger.info("[MCP server] Registered. Capabilities will be logged on first tool call.");

  return { server: mcp, progressBridge };
}

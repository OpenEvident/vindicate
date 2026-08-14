import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { config } from "../../src/core/config.js";
import { BrowserReadSessionState } from "../../src/mcp/tools/browser-read-session-state.js";
import { registerBrowserSessionTool } from "../../src/mcp/tools/browser-session-tool.js";
import { SessionNotFoundError } from "../../src/shared/errors.js";
import { toMcpToolError } from "../../src/mcp/tools/error-mapper.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

describe("browser_session tool", () => {
  it("registers and delegates create to worker client", async () => {
    const fake = new FakeWorkerClient();
    const server = new McpServer({ name: "test", version: "0" });
    registerBrowserSessionTool(server, {
      workerClient: fake,
      projectRoot: config.VINDICATE_PROJECT_ROOT,
      browserReadState: new BrowserReadSessionState()
    });

    await fake.createSession({
      name: "demo",
      url: "https://example.com",
      project_root: config.VINDICATE_PROJECT_ROOT
    });
    expect(fake.calls[0]?.method).toBe("createSession");
  });

  it("maps worker errors via toMcpToolError", () => {
    const result = toMcpToolError(new SessionNotFoundError("00000000-0000-4000-8000-000000000001"));
    expect(result.isError).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { BrowserReadSessionState } from "../../src/mcp/tools/browser-read-session-state.js";
import { registerBrowserDiagnoseTool } from "../../src/mcp/tools/browser-diagnose-tool.js";
import type { WorkerStep } from "../../src/worker/worker-client.interface.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
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

class ScreenshotFakeWorkerClient extends FakeWorkerClient {
  override async runStep(sessionId: string, step: WorkerStep) {
    if (step.action === "screenshot") {
      this.calls.push({ method: "runStep", args: [sessionId, step] });
      return {
        step: 0,
        result: {
          action: "screenshot",
          image_base64: "aGVsbG8=",
          mime: "image/jpeg",
          url: "https://app.test/page",
          title: "Test Page",
          scope_applied: "viewport"
        }
      };
    }
    return super.runStep(sessionId, step);
  }
}

describe("browser_diagnose tool", () => {
  const sessionId = "00000000-0000-4000-8000-000000000099";

  it("returns precondition message when no prior browser_read", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerBrowserDiagnoseTool(server, {
      workerClient: new FakeWorkerClient(),
      browserReadState: new BrowserReadSessionState()
    });

    const result = await getToolHandler(server, "browser_diagnose")({ session_id: sessionId });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("browser_read");
    expect(result.content[0]?.text).toContain("fallback");
  });

  it("wraps screenshot into image block and text header on success", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const browserReadState = new BrowserReadSessionState();
    browserReadState.setLastSnapshotId(sessionId, 1);
    const worker = new ScreenshotFakeWorkerClient();

    registerBrowserDiagnoseTool(server, {
      workerClient: worker,
      browserReadState
    });

    const result = await getToolHandler(server, "browser_diagnose")({ session_id: sessionId });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      type: "image",
      data: "aGVsbG8=",
      mimeType: "image/jpeg"
    });
    expect(result.content[1]?.text).toBe("https://app.test/page · Test Page · viewport");
    expect(worker.calls.some((c) => c.method === "runStep")).toBe(true);
  });
});

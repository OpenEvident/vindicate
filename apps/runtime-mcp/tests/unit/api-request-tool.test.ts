import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerApiRequestTool } from "../../src/mcp/tools/api-request-tool.js";
import { ApiRequestFailedError } from "../../src/shared/errors.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

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

describe("api_request tool", () => {
  it("returns the live status/headers/body as JSON on success", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const worker = new FakeWorkerClient();
    worker.setNextApiRequestResponse({
      status: 200,
      status_text: "OK",
      headers: { "content-type": "application/json" },
      body: '{"id":1}',
      body_json: { id: 1 }
    });
    registerApiRequestTool(server, { workerClient: worker });

    const result = await getToolHandler(server, "api_request")({
      method: "GET",
      url: "https://example.com/posts/1"
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(JSON.parse(text)).toMatchObject({ status: 200, body_json: { id: 1 } });
    expect(worker.calls.some((c) => c.method === "apiRequest")).toBe(true);
  });

  it("never marks a 4xx/5xx target response as a tool error — that's a normal result", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const worker = new FakeWorkerClient();
    worker.setNextApiRequestResponse({ status: 500, status_text: "Internal Server Error", headers: {}, body: "" });
    registerApiRequestTool(server, { workerClient: worker });

    const result = await getToolHandler(server, "api_request")({ method: "GET", url: "https://example.com/thing" });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({ status: 500 });
  });

  it("maps an unreachable target host to an error result, without crashing", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const worker = new FakeWorkerClient();
    worker.failNextApiRequest(new ApiRequestFailedError("GET https://x.invalid/ failed: getaddrinfo ENOTFOUND"));
    registerApiRequestTool(server, { workerClient: worker });

    const result = await getToolHandler(server, "api_request")({ method: "GET", url: "https://x.invalid/" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("could not reach the target API");
  });

  it("forwards headers, body, body_type, and params through to the worker client", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const worker = new FakeWorkerClient();
    registerApiRequestTool(server, { workerClient: worker });

    await getToolHandler(server, "api_request")({
      method: "POST",
      url: "https://example.com/posts",
      headers: { Authorization: "Bearer tok" },
      body: { title: "hi" },
      body_type: "json",
      params: { verbose: "true" }
    });

    const call = worker.calls.find((c) => c.method === "apiRequest");
    expect(call?.args[0]).toEqual({
      method: "POST",
      url: "https://example.com/posts",
      headers: { Authorization: "Bearer tok" },
      body: { title: "hi" },
      body_type: "json",
      params: { verbose: "true" }
    });
  });
});

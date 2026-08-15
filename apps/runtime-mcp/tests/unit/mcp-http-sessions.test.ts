import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { ContentService } from "../../src/content/content-service.js";
import { config } from "../../src/core/config.js";
import { createMcpHttpSessionManager } from "../../src/mcp/mcp-http-sessions.js";
import { FakeWorkerClient } from "../fakes/fake-worker-client.js";

vi.mock("../../src/mcp/tools/browser-session-tool.js", () => ({
  registerBrowserSessionTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-navigate-tool.js", () => ({
  registerBrowserNavigateTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/browser-act-tool.js", () => ({ registerBrowserActTool: vi.fn() }));
vi.mock("../../src/mcp/tools/browser-read-tool.js", () => ({ registerBrowserReadTool: vi.fn() }));
vi.mock("../../src/mcp/tools/browser-assert-tool.js", () => ({
  registerBrowserAssertTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/generate-code-tool.js", () => ({ registerGenerateCodeTool: vi.fn() }));
vi.mock("../../src/mcp/tools/validate-story-tool.js", () => ({
  registerValidateStoryTool: vi.fn()
}));
vi.mock("../../src/mcp/tools/test-tool.js", () => ({ registerTestTool: vi.fn() }));
vi.mock("../../src/mcp/tools/scaffold-tools.js", () => ({ registerScaffoldTools: vi.fn() }));
vi.mock("../../src/mcp/tools/recording-tools.js", () => ({ registerRecordingTools: vi.fn() }));
vi.mock("../../src/mcp/tools/ask-user-tool.js", () => ({ registerAskUserTool: vi.fn() }));
vi.mock("../../src/mcp/tools/design-tool.js", () => ({ registerDesignTool: vi.fn() }));
vi.mock("../../src/mcp/tools/show-panel-tool.js", () => ({ registerShowPanelTool: vi.fn() }));
vi.mock("../../src/mcp/resources/elicitation-resources.js", () => ({
  registerElicitationResources: vi.fn()
}));
vi.mock("../../src/mcp/resources/vindicate-app-resource.js", () => ({
  registerVindicateAppResource: vi.fn()
}));
vi.mock("../../src/mcp/tools/workflow-tool.js", () => ({ registerWorkflowTool: vi.fn() }));

const initializeBody = {
  jsonrpc: "2.0" as const,
  method: "initialize" as const,
  id: 1,
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" }
  }
};

function createManager() {
  const makeContentService = vi.fn((projectRoot: string) => new ContentService({ projectRoot }));
  const manager = createMcpHttpSessionManager({
    config,
    workerClient: new FakeWorkerClient(),
    makeContentService
  });
  return { manager, makeContentService };
}

async function postInitialize(
  port: number,
  opts: { query?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; sessionId: string | null; body: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp${opts.query ?? ""}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(opts.headers ?? {})
    },
    body: JSON.stringify(initializeBody)
  });
  return {
    status: response.status,
    sessionId: response.headers.get("mcp-session-id"),
    body: await response.text()
  };
}

describe("createMcpHttpSessionManager", () => {
  it("accepts two independent initialize requests (reconnect-safe)", async () => {
    const { manager } = createManager();
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw.length > 0 ? (JSON.parse(raw) as unknown) : undefined;
        void manager.handleRequest(req, res, body);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const first = await postInitialize(port);
      const second = await postInitialize(port);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.sessionId).toBeTruthy();
      expect(second.sessionId).toBeTruthy();
      expect(first.sessionId).not.toBe(second.sessionId);
      expect(first.body).not.toContain("Server already initialized");
      expect(second.body).not.toContain("Server already initialized");
    } finally {
      await manager.closeAll();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("returns 400 when a non-initialize request has no session id", async () => {
    const { manager } = createManager();
    const server = http.createServer((req, res) => {
      void manager.handleRequest(req, res, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 2,
        params: {}
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 2, params: {} })
      });
      const body = (await response.json()) as { error: { message: string } };
      expect(response.status).toBe(400);
      expect(body.error.message).toContain("Session ID required");
    } finally {
      await manager.closeAll();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("scopes the session to the project_root query (primary) or header (fallback), else config", async () => {
    const { manager, makeContentService } = createManager();
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw.length > 0 ? (JSON.parse(raw) as unknown) : undefined;
        void manager.handleRequest(req, res, body);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    try {
      const viaQuery = await postInitialize(port, { query: "?project_root=%2Ftmp%2Fwindow-a" });
      const viaHeader = await postInitialize(port, {
        headers: { "x-vindicate-project-root": "/tmp/window-b" }
      });
      const viaNeither = await postInitialize(port);

      expect(viaQuery.status).toBe(200);
      expect(viaHeader.status).toBe(200);
      expect(viaNeither.status).toBe(200);
      // Each session builds content scoped to its own root: the query string is
      // primary, the header is the fallback channel, and absent both it falls
      // back to the boot-time VINDICATE_PROJECT_ROOT.
      expect(makeContentService).toHaveBeenCalledWith("/tmp/window-a");
      expect(makeContentService).toHaveBeenCalledWith("/tmp/window-b");
      expect(makeContentService).toHaveBeenCalledWith(config.VINDICATE_PROJECT_ROOT);
    } finally {
      await manager.closeAll();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

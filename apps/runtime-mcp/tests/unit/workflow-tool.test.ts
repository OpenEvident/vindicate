import { describe, expect, it, vi } from "vitest";

import type { GraphDoc } from "../../src/content/graph-types.js";
import type { IContentService, NodeView, WorkflowMap } from "../../src/content/content-service.interface.js";
import { registerWorkflowTool } from "../../src/mcp/tools/workflow-tool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

const mainGraph: GraphDoc = {
  graphId: "main",
  loop: ["understand", "ground", "design", "generate", "execute", "heal", "audit"],
  entryPoints: { write: "understand" },
  nodes: {
    understand: { label: "Understand", terminal: false, modes: [], edges: [{ to: "ground", when: "story approved" }] },
    ground: { label: "Ground", terminal: false, modes: [], edges: [{ to: "design", when: "elements captured" }] },
    design: { label: "Design", terminal: false, modes: [], edges: [] },
    generate: { label: "Generate", terminal: false, modes: [], edges: [] },
    execute: { label: "Execute", terminal: false, modes: [], edges: [] },
    heal: { label: "Heal", terminal: false, modes: [], edges: [] },
    audit: { label: "Audit", terminal: true, modes: [], edges: [] }
  }
};

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content?: Array<{ text?: string }> };
  const text = r.content?.[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function fakeContentService(overrides: Partial<IContentService> = {}): IContentService {
  const mainMap: WorkflowMap = {
    graphId: "main",
    mermaid: "flowchart TD\n  ground --> design",
    entryRouting: [{ path: "write", node: "understand", why: "new tests" }],
    pickEntry: "Pick a path."
  };
  const nodeView: NodeView = {
    node: "ground",
    markdown: "# Ground\n\nCapture elements.",
    outgoingEdges: [{ to: "design", when: "elements captured" }],
    terminal: false
  };
  return {
    getMap: vi.fn(() => mainMap),
    getGraph: vi.fn(() => mainGraph),
    resolvePathEntry: vi.fn((path: string) => {
      if (path === "write") {
        return { graphId: "main" as const, nodeId: "understand" };
      }
      if (path === "bootstrap") {
        return { graphId: "setup" as const, nodeId: "understand" };
      }
      return undefined;
    }),
    getNode: vi.fn(() => nodeView),
    getSetupSkill: vi.fn(() => ({ ...nodeView, node: "setup", markdown: "# Setup\n\nBootstrap." })),
    listNodeIds: vi.fn(() => ["understand", "ground", "design", "setup"]),
    getWorkflowProgressGuide: vi.fn(() => ""),
    ...overrides
  };
}

function stubAppsPanel(server: McpServer, supported: boolean): void {
  if (!supported) {
    return;
  }
  (server.server as { getClientCapabilities?: () => unknown }).getClientCapabilities = () => ({
    extensions: {
      "io.modelcontextprotocol/ui": {
        mimeTypes: [RESOURCE_MIME_TYPE]
      }
    }
  });
}

describe("workflow-tool", () => {
  it("returns progress panel payload on orient call", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(server, fakeContentService());
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(await internal._registeredTools["vindicate_workflow"]!.handler({}));
    expect(body.view).toBe("workflow-progress");
    expect(body.status).toBe("orient");
    expect(body.phase_instructions).toContain("flowchart");
    expect(body.progress_display).toEqual(
      expect.objectContaining({ mode: "markdown_in_chat" })
    );
    expect(body.markdown_panel).toContain("Vindicate");
  });

  it("appends workflow ref only on orient and first path call", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(
      server,
      fakeContentService({
        getWorkflowProgressGuide: vi.fn(() => "# Workflow tool — how to read this response")
      })
    );
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };

    const orient = parseResult(await internal._registeredTools["vindicate_workflow"]!.handler({}));
    const firstPath = parseResult(await internal._registeredTools["vindicate_workflow"]!.handler({ path: "write" }));
    const laterPhase = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "write",
        node: "ground",
        from: "understand",
        completed: ["understand"]
      })
    );

    expect(orient.phase_instructions).toContain("how to read this response");
    expect(firstPath.phase_instructions).toContain("how to read this response");
    expect(laterPhase.phase_instructions).not.toContain("how to read this response");
  });

  it("omits markdown_panel when client supports MCP Apps UI", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    stubAppsPanel(server, true);
    registerWorkflowTool(server, fakeContentService());
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "write",
        node: "ground",
        from: "understand",
        completed: ["understand"]
      })
    );
    expect(body.progress_display).toEqual(
      expect.objectContaining({ mode: "mcp_app" })
    );
    expect(body.markdown_panel).toBeUndefined();
    expect(body.phases).toBeDefined();
  });

  it("filters done_before_leave to the active path on multi-branch nodes", async () => {
    const groundView: NodeView = {
      node: "ground",
      markdown: "# Ground",
      outgoingEdges: [
        { to: "design", when: "path == write — all required elements captured/validated" },
        { to: "generate", when: "path == fix — the failing element has been re-captured" },
        { to: "coverage", when: "path == gaps — screens mapped against the test inventory" }
      ],
      terminal: false
    };
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(
      server,
      fakeContentService({
        getNode: vi.fn(() => groundView),
        resolvePathEntry: vi.fn((path: string) => {
          if (path === "write") {
            return { graphId: "main" as const, nodeId: "understand" };
          }
          if (path === "gaps") {
            return { graphId: "main" as const, nodeId: "ground" };
          }
          return undefined;
        })
      })
    );
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };

    const writeBody = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "write",
        node: "ground",
        from: "understand",
        completed: ["understand"]
      })
    );
    const gapsBody = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "gaps",
        node: "ground",
        completed: []
      })
    );

    expect(writeBody.agent_directives).toEqual(
      expect.objectContaining({
        done_before_leave: ["all required elements captured/validated"]
      })
    );
    expect(gapsBody.agent_directives).toEqual(
      expect.objectContaining({
        done_before_leave: ["screens mapped against the test inventory"]
      })
    );
  });

  it("keeps all done_before_leave items when edges are not path-tagged", async () => {
    const executeView: NodeView = {
      node: "execute",
      markdown: "# Execute",
      outgoingEdges: [
        { to: "audit", when: "all targeted tests pass" },
        { to: "heal", when: "there are failures that look fixable in-workflow" },
        { to: "escalate", when: "a failure is a genuine app bug — do not edit the tests" }
      ],
      terminal: false
    };
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(
      server,
      fakeContentService({
        getNode: vi.fn(() => executeView),
        resolvePathEntry: vi.fn((path: string) => {
          if (path === "write") {
            return { graphId: "main" as const, nodeId: "understand" };
          }
          if (path === "smoke") {
            return { graphId: "main" as const, nodeId: "execute" };
          }
          return undefined;
        })
      })
    );
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "smoke",
        node: "execute",
        completed: ["understand", "ground", "design", "generate"]
      })
    );
    expect(body.agent_directives).toEqual(
      expect.objectContaining({
        done_before_leave: [
          "all targeted tests pass",
          "there are failures that look fixable in-workflow",
          "a failure is a genuine app bug — do not edit the tests"
        ]
      })
    );
  });

  it("returns progress + node guidance when node is provided", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(server, fakeContentService());
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "write",
        node: "ground",
        from: "understand",
        completed: ["understand"]
      })
    );
    expect(body.view).toBe("workflow-progress");
    expect(body.phase).toBe("ground");
    expect(body.phase_instructions).toContain("Capture elements");
    expect(body.progress_echo).toEqual({ path: "write", node: "ground", completed: ["understand"] });
    expect(body.agent_directives).toEqual(
      expect.objectContaining({ done_before_leave: ["elements captured"] })
    );
    expect(body.done_checklist).toBeUndefined();
  });

  it("requires path when node is set", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(server, fakeContentService());
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const result = (await internal._registeredTools["vindicate_workflow"]!.handler({
      node: "ground"
    })) as { isError?: boolean; content?: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("requires path");
  });

  it("returns setup skill for bootstrap path", async () => {
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(server, fakeContentService());
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({ path: "bootstrap" })
    );
    expect(body.phase_instructions).toContain("Bootstrap");
  });

  it("errors clearly on unknown node", async () => {
    const getNode = vi.fn(() => {
      throw new Error("Unknown node: missing");
    });
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(server, fakeContentService({ getNode }));
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const result = (await internal._registeredTools["vindicate_workflow"]!.handler({
      path: "write",
      node: "missing"
    })) as { isError?: boolean; content?: Array<{ text?: string }> };
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Unknown workflow node");
  });

  it("serves the requirements path as a terminal single-node workflow", async () => {
    const requirementsView: NodeView = {
      node: "requirements",
      markdown: "# Requirements\n\nDraft a story from a recording.",
      outgoingEdges: [],
      terminal: true
    };
    const graphWithRequirements: GraphDoc = {
      ...mainGraph,
      entryPoints: { ...mainGraph.entryPoints, requirements: "requirements" },
      nodes: {
        ...mainGraph.nodes,
        requirements: { label: "Requirements", terminal: true, modes: [], edges: [] }
      }
    };
    const server = new McpServer({ name: "t", version: "0" }, { capabilities: {} });
    registerWorkflowTool(
      server,
      fakeContentService({
        getGraph: vi.fn(() => graphWithRequirements),
        getNode: vi.fn(() => requirementsView),
        resolvePathEntry: vi.fn((path: string) => {
          if (path === "requirements") {
            return { graphId: "main" as const, nodeId: "requirements" };
          }
          return undefined;
        })
      })
    );
    const internal = server as unknown as {
      _registeredTools: Record<string, { handler: (a: object) => Promise<unknown> }>;
    };
    const body = parseResult(
      await internal._registeredTools["vindicate_workflow"]!.handler({
        path: "requirements",
        node: "requirements",
        completed: []
      })
    );
    expect(body.view).toBe("workflow-progress");
    expect(body.phase).toBe("requirements");
    expect(body.phase_instructions).toContain("Draft a story from a recording");
    expect(body.progress_echo).toEqual({
      path: "requirements",
      node: "requirements",
      completed: []
    });
    expect(body.phases).toEqual([
      { id: "requirements", label: "Requirements", status: "active" }
    ]);
    // Terminal node: no next-phase suggestion into ground/design/generate.
    expect(
      (body.agent_directives as { next_when_ready?: string } | undefined)?.next_when_ready
    ).toBeUndefined();
  });
});

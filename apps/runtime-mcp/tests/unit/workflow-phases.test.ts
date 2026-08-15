import { describe, expect, it } from "vitest";

import type { GraphDoc } from "../../src/content/graph-types.js";
import { buildWorkflowPhases, spineForPath } from "../../src/mcp/panels/workflow-phases.js";
import { formatWorkflowProgressMarkdown } from "../../src/mcp/panels/workflow-progress-markdown.js";

const mainGraph: GraphDoc = {
  graphId: "main",
  loop: ["understand", "ground", "design", "generate", "execute", "heal", "audit"],
  entryPoints: { write: "understand", fix: "heal", smoke: "execute" },
  nodes: {
    understand: {
      label: "Understand",
      terminal: false,
      modes: [],
      edges: [{ to: "ground", when: "story approved" }]
    },
    ground: {
      label: "Ground",
      terminal: false,
      modes: [],
      edges: [{ to: "design", when: "elements captured" }]
    },
    design: {
      label: "Design",
      terminal: false,
      modes: [],
      edges: [{ to: "generate", when: "plan approved" }]
    },
    generate: {
      label: "Generate",
      terminal: false,
      modes: [],
      edges: [{ to: "execute", when: "audit clean" }]
    },
    execute: {
      label: "Execute",
      terminal: false,
      modes: [],
      edges: [{ to: "audit", when: "tests pass" }]
    },
    heal: { label: "Heal", terminal: false, modes: [], edges: [{ to: "ground", when: "drift" }] },
    audit: { label: "Audit", terminal: true, modes: [], edges: [] }
  }
};

describe("workflow-phases", () => {
  it("returns write-path spine", () => {
    expect(spineForPath("main", "write", mainGraph)).toEqual([
      "understand",
      "ground",
      "design",
      "generate",
      "execute",
      "audit"
    ]);
  });

  it("returns requirements-path spine as a single terminal node", () => {
    const graphWithRequirements: GraphDoc = {
      ...mainGraph,
      entryPoints: { ...mainGraph.entryPoints, requirements: "requirements" },
      nodes: {
        ...mainGraph.nodes,
        requirements: { label: "Requirements", terminal: true, modes: [], edges: [] }
      }
    };
    expect(spineForPath("main", "requirements", graphWithRequirements)).toEqual(["requirements"]);

    const { phases } = buildWorkflowPhases({
      graph: graphWithRequirements,
      path: "requirements",
      activeNode: "requirements",
      completed: []
    });
    expect(phases).toEqual([{ id: "requirements", label: "Requirements", status: "active" }]);
  });

  it("marks completed and active phases", () => {
    const { phases } = buildWorkflowPhases({
      graph: mainGraph,
      path: "write",
      activeNode: "ground",
      completed: ["understand"]
    });
    expect(phases.find((p) => p.id === "understand")?.status).toBe("done");
    expect(phases.find((p) => p.id === "ground")?.status).toBe("active");
    expect(phases.find((p) => p.id === "design")?.status).toBe("pending");
  });

  it("infers completed when completed array omitted", () => {
    const { phases } = buildWorkflowPhases({
      graph: mainGraph,
      path: "write",
      activeNode: "design",
      completed: []
    });
    expect(phases.find((p) => p.id === "understand")?.status).toBe("done");
    expect(phases.find((p) => p.id === "ground")?.status).toBe("done");
    expect(phases.find((p) => p.id === "design")?.status).toBe("active");
  });

  it("inserts heal before execute on write path when active", () => {
    const { phases } = buildWorkflowPhases({
      graph: mainGraph,
      path: "write",
      activeNode: "heal",
      completed: ["understand", "ground", "design", "generate"]
    });
    const ids = phases.map((p) => p.id);
    expect(ids.indexOf("heal")).toBeGreaterThan(ids.indexOf("generate"));
    expect(ids.indexOf("execute")).toBeGreaterThan(ids.indexOf("heal"));
    expect(phases.find((p) => p.id === "heal")?.status).toBe("active");
  });
});

describe("workflow-progress-markdown", () => {
  it("renders phase checklist for fallback clients", () => {
    const md = formatWorkflowProgressMarkdown({
      phaseLabel: "Ground",
      phases: [
        { id: "understand", label: "Understand", status: "done" },
        { id: "ground", label: "Ground", status: "active" }
      ],
      nextCall: "vindicate_workflow(...)"
    });
    expect(md).toContain("✓ 1. Understand");
    expect(md).toContain("● 2. Ground");
    expect(md).toContain("vindicate_workflow");
  });
});

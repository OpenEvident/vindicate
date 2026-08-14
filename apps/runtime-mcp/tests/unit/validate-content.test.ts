import { describe, expect, it } from "vitest";

import {
  validateGraphStructure,
  validateNodeRefs,
  validateNodeTools,
  validateUnsubstitutedVars
} from "../../src/content/validate-content-lib.js";

describe("validate-content-lib", () => {
  it("fails when edge target is missing", () => {
    const result = validateGraphStructure(
      {
        graphId: "main",
        entryPoints: { write: "understand" },
        nodes: {
          understand: { terminal: false, edges: [{ to: "missing", when: "x" }] }
        }
      }
    );
    expect(result.errors.some((e) => e.includes("missing"))).toBe(true);
  });

  it("fails when terminal node has outgoing edges", () => {
    const result = validateGraphStructure(
      {
        graphId: "main",
        entryPoints: { write: "audit" },
        nodes: {
          audit: { terminal: true, edges: [{ to: "ground", when: "x" }] }
        }
      }
    );
    expect(result.errors.some((e) => e.includes("terminal"))).toBe(true);
  });

  it("accepts a terminal requirements entry node with no outgoing edges", () => {
    const result = validateGraphStructure(
      {
        graphId: "main",
        entryPoints: { requirements: "requirements" },
        nodes: {
          requirements: { terminal: true, edges: [] }
        }
      }
    );
    expect(result.errors).toEqual([]);
  });

  it("accepts ref-requirements on the requirements node", () => {
    const errors = validateNodeRefs(
      [
        {
          nodeId: "requirements",
          graphId: "main",
          refs: ["ref-requirements"],
          body: "Call `browser_record_read` then draft the story."
        }
      ],
      new Set(["ref-requirements"])
    );
    expect(errors).toEqual([]);
  });

  it("fails when non-terminal node has no edges", () => {
    const result = validateGraphStructure(
      {
        graphId: "main",
        entryPoints: { write: "ground" },
        nodes: {
          ground: { terminal: false, edges: [] }
        }
      }
    );
    expect(result.errors.some((e) => e.includes("≥1 outgoing"))).toBe(true);
  });

  it("fails when node is orphaned from entry points", () => {
    const result = validateGraphStructure(
      {
        graphId: "main",
        entryPoints: { write: "understand" },
        nodes: {
          understand: { terminal: false, edges: [{ to: "ground", when: "x" }] },
          ground: { terminal: false, edges: [] },
          orphan: { terminal: true, edges: [] }
        }
      }
    );
    expect(result.errors.some((e) => e.includes("orphan"))).toBe(true);
  });

  it("fails when ref file is missing", () => {
    const errors = validateNodeRefs(
      [{ nodeId: "ground", graphId: "main", refs: ["ref-missing"], body: "" }],
      new Set(["ref-contract"])
    );
    expect(errors.some((e) => e.includes("ref-missing"))).toBe(true);
  });

  it("fails when node body references unknown tool", () => {
    const errors = validateNodeTools([
      {
        nodeId: "ground",
        graphId: "main",
        refs: [],
        body: "Call `vindicate_start_task` to begin."
      }
    ]);
    expect(errors.some((e) => e.includes("vindicate_start_task"))).toBe(true);
  });

  it("warns on unknown placeholder vars", () => {
    const warnings = validateUnsubstitutedVars("Use {{unknownVar}} here.", "test");
    expect(warnings.some((w) => w.includes("unknownVar"))).toBe(true);
  });
});

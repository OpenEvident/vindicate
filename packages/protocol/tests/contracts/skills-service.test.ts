import { describe, expect, it } from "vitest";

import {
  GraphNodeDefSchema,
  NodePackSchema,
  WorkflowGraphSchema,
  WorkflowPackResponseSchema,
  WorkflowSessionCreateResponseSchema
} from "../../src/index.js";

const sessionId = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const deliveryId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("skills-service contracts", () => {
  it("parses workflow session create response", () => {
    const parsed = WorkflowSessionCreateResponseSchema.parse({
      sessionId,
      workflowId: "vindicate-qa-playwright",
      workflowVersion: "2.4.0",
      intent: "add_feature",
      expiresAt: "2026-05-13T12:00:00Z",
      limits: {
        maxPackRequests: 32,
        maxSliceTokensPerRequest: 4096,
        maxSearchResults: 20
      }
    });
    expect(parsed.intent).toBe("add_feature");
  });

  it("parses workflow pack response", () => {
    const parsed = WorkflowPackResponseSchema.parse({
      sessionId,
      intent: "add_feature",
      mode: "outline",
      workflowVersion: "2.4.0",
      sections: [
        {
          id: "14",
          title: "Add feature",
          anchor: "sec-add-feature",
          estTokens: 95
        }
      ],
      totalEstTokens: 95,
      missing: [],
      deliveryId
    });
    expect(parsed.sections).toHaveLength(1);
  });

  it("parses workflow graph definition", () => {
    const parsed = WorkflowGraphSchema.parse({
      graphId: "main",
      version: 1,
      description: "Main graph",
      nodes: {
        intake: {
          nodeId: "intake",
          label: "Intake",
          required: true,
          refs: ["ref-bootstrap-gate"],
          transitions: [{ to: "discover", when: "path === 'write'" }]
        },
        discover: {
          nodeId: "discover",
          label: "Discover",
          required: true,
          refs: [],
          transitions: [{ to: "explore" }]
        },
        explore: {
          nodeId: "explore",
          label: "Explore",
          required: true,
          refs: [],
          transitions: []
        }
      }
    });
    expect(parsed.nodes.intake.transitions[0]?.to).toBe("discover");
  });

  it("parses graph node with optional panel", () => {
    const parsed = GraphNodeDefSchema.parse({
      nodeId: "design",
      label: "Design",
      required: true,
      refs: [],
      panel: "design-approval",
      transitions: [{ to: "code-write", when: "path === 'write'" }]
    });
    expect(parsed.panel).toBe("design-approval");
  });

  it("parses node pack response shape", () => {
    const parsed = NodePackSchema.parse({
      nodeId: "code-write",
      graphId: "main",
      sections: [{ sectionId: "main_code_write_v1", content: "<node>", estTokens: 820 }],
      total_tokens: 820,
      required_tools: ["vindicate_generate_code"],
      forbidden_tools: ["run_tests"],
      checkpoint_criteria: "CodeArtifact has files_written (min 1).",
      required_checkpoint_fields: ["files_written"],
      deliveryId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
    });
    expect(parsed.nodeId).toBe("code-write");
  });
});

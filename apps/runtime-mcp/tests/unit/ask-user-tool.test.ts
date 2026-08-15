import { beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  registerAskUserTool,
  resetElicitationSessionForTests
} from "../../src/mcp/tools/ask-user-tool.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
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

function textFromResult(result: Awaited<ReturnType<ToolHandler>>): string {
  const block = result.content[0];
  return block !== undefined && block.type === "text" && block.text !== undefined ? block.text : "";
}

function attachElicit(
  server: McpServer,
  impl: (params: unknown) => Promise<{ action: string; content?: Record<string, unknown> }>
): void {
  const underlying = server.server as {
    elicitInput: typeof impl;
    getClientCapabilities: () => { elicitation: Record<string, unknown> };
  };
  underlying.elicitInput = impl;
  underlying.getClientCapabilities = () => ({ elicitation: {} });
}

describe("ask-user-tool", () => {
  beforeEach(() => {
    resetElicitationSessionForTests();
  });

  it("vindicate_ask_user with options uses elicitation picker when supported", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerAskUserTool(server);
    attachElicit(server, async () => ({
      action: "accept",
      content: { choice: "grow_tests" }
    }));

    const result = await getToolHandler(
      server,
      "vindicate_ask_user"
    )({
      question: "Which workflow?",
      options: [
        { label: "Write tests", value: "grow_tests" },
        { label: "Fix tests", value: "fix_test" }
      ]
    });

    expect(JSON.parse(textFromResult(result))).toEqual({
      answer: "grow_tests",
      answered_via: "ui_picker"
    });
  });

  it("vindicate_ask_user with options falls back when elicitation is cancelled", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerAskUserTool(server);
    attachElicit(server, async () => ({ action: "cancel" }));

    const result = await getToolHandler(
      server,
      "vindicate_ask_user"
    )({
      question: "Which workflow?",
      options: [
        { label: "Write tests", value: "grow_tests" },
        { label: "Fix tests", value: "fix_test" }
      ]
    });

    const body = JSON.parse(textFromResult(result)) as {
      answered_via: string;
      instruction: string;
      options: unknown[];
    };
    expect(body.answered_via).toBe("agent_message");
    expect(body.instruction).toContain("numbered options");
    expect(body.options).toHaveLength(2);
  });

  it("vindicate_ask_user without options uses text elicitation when supported", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerAskUserTool(server);
    attachElicit(server, async () => ({
      action: "accept",
      content: { answer: "checkout flow" }
    }));

    const result = await getToolHandler(
      server,
      "vindicate_ask_user"
    )({
      question: "Which area should we cover?"
    });

    expect(JSON.parse(textFromResult(result))).toEqual({
      answer: "checkout flow",
      answered_via: "ui_input"
    });
  });

  it("vindicate_ask_user without options falls back when elicitation is unavailable", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    registerAskUserTool(server);

    const result = await getToolHandler(
      server,
      "vindicate_ask_user"
    )({
      question: "Which area should we cover?"
    });

    const body = JSON.parse(textFromResult(result)) as {
      answered_via: string;
      instruction: string;
      question: string;
    };
    expect(body.answered_via).toBe("agent_message");
    expect(body.instruction).toContain("Ask this question");
    expect(body.question).toBe("Which area should we cover?");
  });
});

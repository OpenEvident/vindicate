import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  SLASH_ROUTES,
  buildSlashPromptText,
  registerSlashPrompts
} from "../../src/mcp/prompts/slash-prompts.js";

describe("slash prompts", () => {
  it("registers ten slash command prompts", () => {
    const server = new McpServer({ name: "test", version: "0" }, { capabilities: {} });
    registerSlashPrompts(server);

    const internal = (server as unknown as { _registeredPrompts: Record<string, unknown> })
      ._registeredPrompts;
    expect(Object.keys(internal).sort()).toEqual(
      [
        "bootstrap",
        "ci-setup",
        "coverage",
        "fix-test",
        "gaps",
        "heal",
        "refactor",
        "requirements",
        "smoke-test",
        "write-test"
      ].sort()
    );
  });

  it("builds vindicate_workflow routing instructions", () => {
    for (const route of Object.values(SLASH_ROUTES)) {
      const text = buildSlashPromptText(route, "Example goal.");
      expect(text).toContain("vindicate_workflow");
      expect(text).toContain(`path="${route.path}"`);
      expect(text).not.toContain("vindicate_start_task");
      expect(text).not.toContain("intent parameter");
    }
  });

  it("maps slash commands to intake paths", () => {
    expect(SLASH_ROUTES.bootstrap).toEqual({ graph: "setup", path: "bootstrap" });
    expect(SLASH_ROUTES["ci-setup"]).toEqual({ graph: "setup", path: "ci" });
    expect(SLASH_ROUTES["write-test"]).toEqual({ graph: "main", path: "write" });
    expect(SLASH_ROUTES["fix-test"]).toEqual({ graph: "main", path: "fix" });
    expect(SLASH_ROUTES["smoke-test"]).toEqual({ graph: "main", path: "smoke" });
    expect(SLASH_ROUTES.gaps).toEqual({ graph: "main", path: "gaps" });
    expect(SLASH_ROUTES.coverage).toEqual({ graph: "main", path: "coverage" });
    expect(SLASH_ROUTES.heal).toEqual({ graph: "main", path: "flaky" });
    expect(SLASH_ROUTES.refactor).toEqual({ graph: "main", path: "refactor" });
    expect(SLASH_ROUTES.requirements).toEqual({ graph: "main", path: "requirements" });
  });
});

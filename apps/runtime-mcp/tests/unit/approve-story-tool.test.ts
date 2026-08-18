import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ProjectFs } from "../../src/fs/project-fs.js";
import { registerApproveStoryTool } from "../../src/mcp/tools/approve-story-tool.js";

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

function jsonFromResult(result: Awaited<ReturnType<ToolHandler>>): unknown {
  const block = result.content[0];
  return block !== undefined && block.type === "text" && block.text !== undefined
    ? JSON.parse(block.text)
    : undefined;
}

const READY_STORY = `---
feature: login
status: draft
version: 1
---

# Login — dashboard access

Verify that a logged-out user can sign in with valid credentials and reach the dashboard.

**Persona**
users.admin — credentials via AUTH_EMAIL / AUTH_PASSWORD (from .env)

# Feature

- [FA-01-4] User can sign in with email and password

# Acceptance Criteria

AC-1: User can sign in with valid credentials

## Successful sign in [AC-1]
Given a logged-out user at the login page
When they enter valid credentials and click Sign in
Then they land on the dashboard

# Out of Scope

- Password reset flow
`;

const NOT_READY_STORY = READY_STORY.replace(
  "## Successful sign in [AC-1]",
  "## Successful sign in"
);

describe("approve-story-tool", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  async function makeProjectFs(): Promise<{ fs: ProjectFs; root: string }> {
    const root = path.join(os.tmpdir(), `vindicate-approve-story-${Date.now()}-${Math.random()}`);
    roots.push(root);
    await mkdir(path.join(root, ".vindicate", "stories"), { recursive: true });
    return { fs: new ProjectFs({ projectRoot: root, maxFileBytes: 512_000 }), root };
  }

  it("writes status: approved and returns approved:true for a ready story", async () => {
    const { fs, root } = await makeProjectFs();
    const filePath = path.join(root, ".vindicate", "stories", "login.story.md");
    await writeFile(filePath, READY_STORY, "utf8");

    const server = new McpServer({ name: "test", version: "0" });
    registerApproveStoryTool(server, fs);
    const result = await getToolHandler(
      server,
      "vindicate_approve_story"
    )({
      file_path: ".vindicate/stories/login.story.md"
    });

    expect(jsonFromResult(result)).toEqual({
      approved: true,
      file_path: ".vindicate/stories/login.story.md"
    });
    const written = await readFile(filePath, "utf8");
    expect(written).toContain("status: approved");
  });

  it("does not write anything and returns field errors for a story that isn't ready", async () => {
    const { fs, root } = await makeProjectFs();
    const filePath = path.join(root, ".vindicate", "stories", "login.story.md");
    await writeFile(filePath, NOT_READY_STORY, "utf8");

    const server = new McpServer({ name: "test", version: "0" });
    registerApproveStoryTool(server, fs);
    const result = await getToolHandler(
      server,
      "vindicate_approve_story"
    )({
      file_path: ".vindicate/stories/login.story.md"
    });

    const parsed = jsonFromResult(result) as {
      approved: boolean;
      errors: Array<{ field: string }>;
    };
    expect(parsed.approved).toBe(false);
    expect(parsed.errors.some((e) => e.field === "testcase")).toBe(true);

    const untouched = await readFile(filePath, "utf8");
    expect(untouched).toBe(NOT_READY_STORY);
    expect(untouched).toContain("status: draft");
  });

  it("is idempotent when re-run on an already-approved, still-valid story", async () => {
    const { fs, root } = await makeProjectFs();
    const filePath = path.join(root, ".vindicate", "stories", "login.story.md");
    const alreadyApproved = READY_STORY.replace("status: draft", "status: approved");
    await writeFile(filePath, alreadyApproved, "utf8");

    const server = new McpServer({ name: "test", version: "0" });
    registerApproveStoryTool(server, fs);
    const result = await getToolHandler(
      server,
      "vindicate_approve_story"
    )({
      file_path: ".vindicate/stories/login.story.md"
    });

    expect(jsonFromResult(result)).toEqual({
      approved: true,
      file_path: ".vindicate/stories/login.story.md"
    });
  });
});

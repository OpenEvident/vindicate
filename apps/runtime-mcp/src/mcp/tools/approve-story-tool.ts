/**
 * @file vindicate_approve_story MCP tool — validates a story as-if-approved and only then writes
 * `status: approved` for real. Replaces the old two-step "vindicate_validate_story, then hand-edit
 * status: approved" flow, where nothing guaranteed the story was ever validated in its approved
 * shape (testcase [AC-n] tagging is only checked once status !== "draft" — validating while still
 * draft silently skips it).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProjectFs } from "../../fs/project-fs.js";
import { evaluateApproval } from "../../story/approve-story.js";
import { loadOtherStories } from "../../story/load-other-stories.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export function registerApproveStoryTool(server: McpServer, projectFs: ProjectFs): void {
  server.registerTool(
    "vindicate_approve_story",
    {
      description:
        "Approves a `.vindicate/stories/*.story.md` file: validates it as if status were 'approved' (this is what enforces every testcase has its `[AC-n]` tag, which a plain validate call would skip while status is still 'draft'), and only writes `status: approved` if that passes. On failure, nothing is written — fix the returned field-level errors and call again. Use this instead of hand-editing `status: approved`.",
      inputSchema: {
        file_path: z.string().min(1)
      }
    },
    async (args) => {
      try {
        const normalizedPath = args.file_path.replace(/\\/g, "/");
        const content = await projectFs.read(normalizedPath);
        const otherStories = await loadOtherStories(projectFs, normalizedPath);
        const result = evaluateApproval(content, {
          filePath: normalizedPath,
          otherStories
        });

        if (!result.approved) {
          return toolJson({ approved: false, errors: result.errors });
        }

        await projectFs.write(normalizedPath, result.content);
        return toolJson({ approved: true, file_path: normalizedPath });
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

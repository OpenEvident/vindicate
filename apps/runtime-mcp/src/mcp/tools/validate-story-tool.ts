/**
 * @file vindicate_validate_story MCP tool — validates story file structure.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProjectFs } from "../../fs/project-fs.js";
import { loadOtherStories } from "../../story/load-other-stories.js";
import { validateStoryContent } from "../../story/validate-story.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

export function registerValidateStoryTool(server: McpServer, projectFs: ProjectFs): void {
  server.registerTool(
    "vindicate_validate_story",
    {
      description:
        "Validates a `.vindicate/stories/*.story.md` file. Frontmatter must include `feature`, `status` (draft, approved, deprecated), and integer `version` (use 1 for new files). Body must include `# Feature` with unique project-wide `[FA-{domain}-{sub}]` tags, `# Acceptance Criteria` with sequential `AC-1, AC-2, ...`, and BDD testcase headings `## Name [AC-n]`. Returns field-level errors to fix and re-validate.",
      inputSchema: {
        file_path: z.string().min(1)
      },
      annotations: { readOnlyHint: true }
    },
    async (args) => {
      try {
        const normalizedPath = args.file_path.replace(/\\/g, "/");
        const content = await projectFs.read(normalizedPath);
        const otherStories = await loadOtherStories(projectFs, normalizedPath);
        return toolJson(
          validateStoryContent(content, {
            filePath: normalizedPath,
            otherStories
          })
        );
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UrlSchema } from "@vindicate/protocol";
import { z } from "zod";

import type { ProjectFs } from "../../fs/project-fs.js";
import { scaffoldProject } from "../../harness/scaffold-project.js";
import { WorkerValidationError } from "../../shared/errors.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolMarkdown } from "./result.js";

export const SCAFFOLD_CI_PLATFORMS = ["github", "bitbucket"] as const;
export type ScaffoldCiPlatform = (typeof SCAFFOLD_CI_PLATFORMS)[number];

const ScaffoldCiPlatformSchema = z.enum(SCAFFOLD_CI_PLATFORMS);

export const SCAFFOLD_TARGETS = ["ui", "api", "both"] as const;
export type ScaffoldTargetArg = (typeof SCAFFOLD_TARGETS)[number];

const ScaffoldTargetSchema = z.enum(SCAFFOLD_TARGETS);

function missingCiPlatformError(): WorkerValidationError {
  return new WorkerValidationError(
    `scaffold_project requires ci_platform. Allowed values: ${SCAFFOLD_CI_PLATFORMS.join(", ")}. ` +
      "Resolve before retrying: use the user's choice, detect from project-root CI files " +
      "(.github/workflows/*.yml => github, bitbucket-pipelines.yml => bitbucket), or ask once via vindicate_ask_user."
  );
}

function missingTargetError(): WorkerValidationError {
  return new WorkerValidationError(
    `scaffold_project requires target. Allowed values: ${SCAFFOLD_TARGETS.join(", ")}. ` +
      "Resolve before retrying: use the user's explicit choice ('API tests'/'UI tests'/'both'), " +
      "infer confidently from an unambiguous request (e.g. 'test this REST API' => api), " +
      "or ask once via vindicate_ask_user — never guess between api-only and both."
  );
}

export function registerScaffoldTools(server: McpServer, projectFs: ProjectFs): void {
  server.registerTool(
    "scaffold_project",
    {
      description:
        "Scaffolds the Vindicate Playwright project structure — page objects and/or API clients, feature files, config, " +
        "and CI workflow. Requires base_url, ci_platform (github or bitbucket), and target. " +
        "target selects the layer(s): 'ui' (page objects), 'api' (resource clients, no browser config), " +
        "or 'both' (both layers, one project). " +
        "For 'api'/'both', if the API lives on a different host than base_url, pass 'API_BASE_URL' in env_vars " +
        "to wire it into CI — it's optional; api.config.ts already falls back to BASE_URL when unset. " +
        "Returns the list of created files and structure validation result.",
      inputSchema: {
        base_url: UrlSchema,
        ci_platform: ScaffoldCiPlatformSchema.describe(
          "Required. CI platform for the workflow file. Allowed: github, bitbucket."
        ),
        target: ScaffoldTargetSchema.describe(
          "Required. Which layer(s) to scaffold: 'ui', 'api', or 'both'. Ask the user once via " +
            "vindicate_ask_user if genuinely ambiguous — don't guess between api-only and both."
        ),
        project_dir: z
          .string()
          .optional()
          .describe(
            "Optional relative subdirectory inside the opened project folder (e.g. 'vindicate-test'). " +
              "Never an absolute path or the project root itself — omit this field entirely to scaffold into the opened folder."
          ),
        node_version: z.string().optional(),
        env_vars: z.array(z.string()).optional(),
        secret_vars: z.array(z.string()).optional(),
        overwrite: z.boolean().optional()
      },
      annotations: { destructiveHint: true }
    },
    async (args) => {
      try {
        if (args.ci_platform === undefined) {
          return toMcpToolError(missingCiPlatformError());
        }
        if (args.target === undefined) {
          return toMcpToolError(missingTargetError());
        }
        const result = await scaffoldProject(projectFs, {
          baseUrl: args.base_url,
          ciPlatform: args.ci_platform,
          target: args.target,
          ...(args.project_dir !== undefined ? { projectDir: args.project_dir } : {}),
          ...(args.node_version !== undefined ? { nodeVersion: args.node_version } : {}),
          ...(args.env_vars !== undefined ? { envVars: args.env_vars } : {}),
          ...(args.secret_vars !== undefined ? { secretVars: args.secret_vars } : {}),
          ...(args.overwrite !== undefined ? { overwrite: args.overwrite } : {})
        });
        const lines = [
          "## Project scaffolded",
          "",
          "**Files created:**",
          ...result.filesCreated.map((f: string) => `- \`${f}\``)
        ];
        if (result.skipped.length > 0) {
          lines.push("", "**Skipped (already exist):**");
          lines.push(...result.skipped.map((f: string) => `- \`${f}\``));
          if (args.overwrite !== true) {
            lines.push("", "> Set `overwrite=true` to replace existing files.");
          }
        }
        return toolMarkdown(lines.join("\n"));
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

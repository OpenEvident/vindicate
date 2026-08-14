/**
 * @file MCP prompt templates for Vindicate slash commands.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SLASH_ROUTES = {
  bootstrap: { graph: "setup", path: "bootstrap" },
  "write-test": { graph: "main", path: "write" },
  "fix-test": { graph: "main", path: "fix" },
  "smoke-test": { graph: "main", path: "smoke" },
  gaps: { graph: "main", path: "gaps" },
  coverage: { graph: "main", path: "coverage" },
  heal: { graph: "main", path: "flaky" },
  refactor: { graph: "main", path: "refactor" },
  requirements: { graph: "main", path: "requirements" },
  "ci-setup": { graph: "setup", path: "ci" }
} as const;

export type SlashRoute = (typeof SLASH_ROUTES)[keyof typeof SLASH_ROUTES];

export function buildSlashPromptText(
  route: SlashRoute,
  headline: string,
  contextLines: string[] = []
): string {
  const context =
    contextLines.length > 0
      ? `\n\nContext:\n${contextLines.map((l) => `- ${l}`).join("\n")}`
      : "";
  return [
    headline,
    `Call vindicate_workflow with path="${route.path}" to load the workflow map and entry node for this task.`,
    context
  ].join("\n");
}

function promptResult(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text }
      }
    ]
  };
}

export function registerSlashPrompts(server: McpServer): void {
  server.registerPrompt(
    "bootstrap",
    {
      title: "Bootstrap automation",
      description: "Set up Playwright automation for this project from scratch",
      argsSchema: {
        url: z.string().optional().describe("Base URL of the app (e.g. https://localhost:3000)"),
        project_dir: z.string().optional().describe("Subdirectory to scaffold into (e.g. vindicate-test). Omit to scaffold at repo root.")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES.bootstrap,
          "Set up Vindicate Playwright automation for this project.",
          [
            ...(args.url ? [`App URL: ${args.url}`] : []),
            ...(args.project_dir ? [`Project dir: ${args.project_dir}`] : [])
          ]
        )
      )
  );

  server.registerPrompt(
    "write-test",
    {
      title: "Grow tests",
      description: "Write, update, or extend Playwright tests for existing functionality",
      argsSchema: {
        feature: z.string().optional().describe("Feature or area to cover"),
        url: z.string().optional().describe("Starting URL for exploration")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES["write-test"],
          "Write new automated tests.",
          [
            ...(args.feature ? [`Feature: ${args.feature}`] : []),
            ...(args.url ? [`URL: ${args.url}`] : [])
          ]
        )
      )
  );

  server.registerPrompt(
    "fix-test",
    {
      title: "Fix failing test",
      description: "Fix a failing Playwright test",
      argsSchema: {
        test: z.string().optional().describe("Test name or spec path")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES["fix-test"],
          "Fix a failing Playwright test.",
          [...(args.test ? [`Test: ${args.test}`] : [])]
        )
      )
  );

  server.registerPrompt(
    "smoke-test",
    {
      title: "Run smoke tests",
      description: "Run existing tests against a URL",
      argsSchema: {
        url: z.string().optional().describe("URL to verify")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES["smoke-test"],
          "Run smoke verification with existing tests.",
          [...(args.url ? [`URL: ${args.url}`] : [])]
        )
      )
  );

  server.registerPrompt(
    "gaps",
    {
      title: "Find coverage gaps",
      description: "Find missing test coverage",
      argsSchema: {
        area: z.string().optional().describe("Product area to analyse")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES.gaps,
          "Analyse test coverage gaps.",
          [...(args.area ? [`Area: ${args.area}`] : [])]
        )
      )
  );

  server.registerPrompt(
    "coverage",
    {
      title: "AC coverage report",
      description: "Compare stories to specs for AC coverage without browser exploration",
      argsSchema: {
        feature: z.string().optional().describe("Feature or story area to analyse")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES.coverage,
          "Report AC coverage from stories vs specs.",
          [...(args.feature ? [`Feature: ${args.feature}`] : [])]
        )
      )
  );

  server.registerPrompt(
    "heal",
    {
      title: "Heal flaky tests",
      description: "Stabilise intermittently failing Playwright tests"
    },
    () =>
      promptResult(
        buildSlashPromptText(SLASH_ROUTES.heal, "Stabilise flaky Playwright tests.")
      )
  );

  server.registerPrompt(
    "refactor",
    {
      title: "Refactor tests",
      description: "Restructure test files and page objects without changing behaviour",
      argsSchema: { files: z.string().optional().describe("Files or folder to refactor") }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES.refactor,
          "Refactor Playwright tests.",
          [...(args.files ? [`Target: ${args.files}`] : [])]
        )
      )
  );

  server.registerPrompt(
    "requirements",
    {
      title: "Draft requirements from recording",
      description: "Draft a requirements/story doc from a recording only — no test generation",
      argsSchema: {
        recording: z.string().optional().describe("Recording name or artifact path"),
        feature: z.string().optional().describe("Feature slug to draft")
      }
    },
    (args) =>
      promptResult(
        buildSlashPromptText(
          SLASH_ROUTES.requirements,
          "Draft requirements/a story from a recording only — do not generate tests or code.",
          [
            ...(args.recording ? [`Recording: ${args.recording}`] : []),
            ...(args.feature ? [`Feature: ${args.feature}`] : [])
          ]
        )
      )
  );

  server.registerPrompt(
    "ci-setup",
    {
      title: "Set up CI",
      description: "Add or fix CI pipeline configuration for Playwright tests"
    },
    () =>
      promptResult(
        buildSlashPromptText(SLASH_ROUTES["ci-setup"], "Set up CI for Playwright tests.")
      )
  );
}

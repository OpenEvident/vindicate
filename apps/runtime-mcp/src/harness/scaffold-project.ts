import path from "node:path";

import type { ProjectFs } from "../fs/project-fs.js";
import type { ScaffoldTarget } from "../scaffold/template-loader.js";
import { loadScaffoldTemplates } from "../scaffold/template-loader.js";
import { FileNotFoundError, WorkerValidationError } from "../shared/errors.js";

export interface ScaffoldProjectInput {
  readonly baseUrl: string;
  readonly ciPlatform: "github" | "bitbucket" | "gitlab" | "circleci" | "other";
  readonly projectDir?: string;
  readonly nodeVersion?: string;
  readonly envVars?: string[];
  readonly secretVars?: string[];
  readonly overwrite?: boolean;
  /** UI-only, API-only, or both. Required — callers must resolve this explicitly. */
  readonly target: ScaffoldTarget;
}

export interface ScaffoldProjectResult {
  readonly filesCreated: string[];
  readonly skipped: string[];
  readonly structure_valid: true;
}

/** npm/pnpm deploy omits packaged files named `.gitignore`; template is stored as `gitignore`. */
const SCAFFOLD_OUTPUT_PATHS: Record<string, string> = {
  gitignore: ".gitignore"
};

function scaffoldOutputPath(templatePath: string): string {
  return SCAFFOLD_OUTPUT_PATHS[templatePath] ?? templatePath;
}

function renderTemplate(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}


function ciBlocks(
  envVars: string[],
  secretVars: string[],
  platform: "github" | "bitbucket" | "gitlab" | "circleci"
): { envVarsBlock: string; secretVarsBlock: string } {
  if (platform === "github") {
    return {
      envVarsBlock: envVars.map((n) => `      ${n}: \${{ vars.${n} }}`).join("\n"),
      secretVarsBlock: secretVars.map((n) => `      ${n}: \${{ secrets.${n} }}`).join("\n")
    };
  }
  if (platform === "circleci") {
    return {
      envVarsBlock: envVars.map((n) => `      ${n}: "\${${n}}"`).join("\n"),
      secretVarsBlock: secretVars.map((n) => `      ${n}: "\${${n}}"`).join("\n")
    };
  }
  return {
    envVarsBlock: envVars.map((n) => `  ${n}: "$CI_${n}"`).join("\n"),
    secretVarsBlock: secretVars.map((n) => `  ${n}: "$CI_${n}"`).join("\n")
  };
}

/** Computed blocks for playwright.config.ts's browser-only pieces (the devices import, the
 * screenshot/video/action-timeout use-block, and the chromium projects array) — present for "ui"
 * and "both", empty for "api" (no browser is ever launched, so they'd just be dead config). Same
 * computed-placeholder pattern as {@link ciBlocks}, not a new templating engine. */
function browserConfigBlocks(
  target: ScaffoldTarget
): { devicesImport: string; browserUseBlock: string; projectsBlock: string } {
  if (target === "api") {
    return { devicesImport: "", browserUseBlock: "", projectsBlock: "" };
  }
  return {
    devicesImport: ", devices",
    browserUseBlock:
      "    screenshot: 'only-on-failure',\n" +
      "    video: 'retain-on-failure',\n" +
      "    actionTimeout: 30000,\n" +
      "    navigationTimeout: 120000,\n",
    projectsBlock:
      "  projects: [\n" +
      "    {\n" +
      "      name: 'chromium',\n" +
      "      use: {\n" +
      "        ...devices['Desktop Chrome'],\n" +
      "        launchOptions: { args: ['--no-sandbox'] },\n" +
      "      },\n" +
      "    },\n" +
      "  ],\n"
  };
}

/** Extra, commented `.env.example` lines for target-specific optional config — appended after the
 * always-present `BASE_URL` line. */
function envExampleExtras(target: ScaffoldTarget): string {
  if (target === "ui") {
    return "";
  }
  return (
    "\n# Only needed if the API lives on a different host than BASE_URL.\n" +
    "# API_BASE_URL=https://api.example.com/\n"
  );
}

const CI_TEMPLATE_BY_PLATFORM: Record<Exclude<ScaffoldProjectInput["ciPlatform"], "other">, string> = {
  github: ".github/workflows/vindicate-tests.yml",
  bitbucket: "bitbucket-pipelines.yml",
  gitlab: ".gitlab-ci.yml",
  circleci: ".circleci/config.yml"
};

function ciTemplateForPath(relPath: string): keyof typeof CI_TEMPLATE_BY_PLATFORM | undefined {
  if (relPath === ".github/workflows/vindicate-tests.yml") {
    return "github";
  }
  if (relPath === "bitbucket-pipelines.yml") {
    return "bitbucket";
  }
  if (relPath === ".gitlab-ci.yml") {
    return "gitlab";
  }
  if (relPath.startsWith(".circleci/")) {
    return "circleci";
  }
  return undefined;
}

export async function scaffoldProject(
  fs: ProjectFs,
  input: ScaffoldProjectInput
): Promise<ScaffoldProjectResult> {
  const target: ScaffoldTarget = input.target;
  const templates = await loadScaffoldTemplates(target);
  const projectDir = normalizeProjectDir(input.projectDir ?? ".");
  const nodeVersion = input.nodeVersion ?? "20";
  const envVars = normalizeVarNames(input.envVars ?? ["BASE_URL"]).filter((name) => name !== "BASE_URL");
  const secretVars = normalizeVarNames(input.secretVars ?? []);
  const ciPlatform = input.ciPlatform === "other" ? "github" : input.ciPlatform;
  const blocks = ciBlocks(envVars, secretVars, ciPlatform);
  const browserBlocks = browserConfigBlocks(target);
  const selectedCiTemplate =
    input.ciPlatform === "other" ? undefined : CI_TEMPLATE_BY_PLATFORM[input.ciPlatform];
  const vars: Record<string, string> = {
    BASE_URL: input.baseUrl,
    projectName: "vindicate-tests",
    nodeVersion,
    envVarsBlock: blocks.envVarsBlock,
    secretVarsBlock: blocks.secretVarsBlock,
    DEVICES_IMPORT: browserBlocks.devicesImport,
    BROWSER_USE_BLOCK: browserBlocks.browserUseBlock,
    PROJECTS_BLOCK: browserBlocks.projectsBlock
  };

  const filesCreated: string[] = [];
  const skipped: string[] = [];

  const includesUi = target === "ui" || target === "both";
  const includesApi = target === "api" || target === "both";
  const standardDirs = [
    "tests/.gitkeep",
    "support/config/.gitkeep",
    "support/data/.gitkeep",
    ".vindicate/.gitkeep",
    ...(includesUi ? ["pages/.gitkeep", "panels/.gitkeep"] : []),
    ...(includesApi ? ["clients/.gitkeep", "builders/.gitkeep"] : [])
  ];
  for (const gitkeep of standardDirs) {
    const p = inProject(projectDir, gitkeep);
    const exists = await fileExists(fs, p);
    if (!exists) {
      await fs.write(p, "");
      filesCreated.push(p);
    }
  }

  for (const [relPath, template] of Object.entries(templates)) {
    const templateCiPlatform = ciTemplateForPath(relPath);
    if (templateCiPlatform && relPath !== selectedCiTemplate) {
      continue;
    }

    const outPath = inProject(projectDir, scaffoldOutputPath(relPath));
    let content = renderTemplate(template, vars);
    if (outPath.endsWith(".gitignore")) {
      content = ensureEnvIgnoredInGitignore(content);
    }
    const exists = await fileExists(fs, outPath);
    if (exists && input.overwrite !== true) {
      skipped.push(outPath);
      continue;
    }
    await fs.write(outPath, content);
    filesCreated.push(outPath);
  }

  // `.env` / `.env.example` are written here (not from templates) so the base URL is
  // always present and the leading-dot filenames can't be dropped by package publishing.
  const envFiles: ReadonlyArray<{ path: string; content: string }> = [
    { path: inProject(projectDir, ".env"), content: `BASE_URL=${input.baseUrl}\n` },
    {
      path: inProject(projectDir, ".env.example"),
      content: `# Example environment file — safe to commit.\nBASE_URL=${input.baseUrl}\n${envExampleExtras(target)}`
    }
  ];
  for (const { path: envPath, content } of envFiles) {
    if ((await fileExists(fs, envPath)) && input.overwrite !== true) {
      skipped.push(envPath);
      continue;
    }
    await fs.write(envPath, content);
    filesCreated.push(envPath);
  }

  // `.vindicate/config.json` at CWD (always unprefixed) tells codegen where the project lives, and
  // now what layer(s) it was scaffolded with — so a per-feature `layer` choice later only ever
  // offers what this project actually has infrastructure for (e.g. never offers "api" in a
  // ui-only-scaffolded project).
  const configPath = ".vindicate/config.json";
  const configContent = `${JSON.stringify({ projectRoot: projectDir, target }, null, 2)}\n`;
  if ((await fileExists(fs, configPath)) && input.overwrite !== true) {
    skipped.push(configPath);
  } else {
    await fs.write(configPath, configContent);
    filesCreated.push(configPath);
  }

  return { filesCreated, skipped, structure_valid: true };
}

/** User-project `.gitignore` must ignore `.env`; omit from template so monorepo can track `content/templates/.env`. */
function ensureEnvIgnoredInGitignore(content: string): string {
  if (/(^|\n)\.env\s*($|\n)/.test(content)) {
    return content;
  }
  return `${content.trimEnd()}\n.env\n`;
}

function normalizeVarNames(vars: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of vars) {
    const value = raw.trim();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

async function fileExists(fs: ProjectFs, relPath: string): Promise<boolean> {
  try {
    await fs.read(relPath);
    return true;
  } catch (err: unknown) {
    if (err instanceof FileNotFoundError) {
      return false;
    }
    throw err;
  }
}

function normalizeProjectDir(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (trimmed.length === 0 || trimmed === ".") return ".";
  if (path.isAbsolute(trimmed) || trimmed.split("/").some((seg) => seg === "..")) {
    throw new WorkerValidationError(
      `Invalid project_dir: '${raw}' — must be a relative subdirectory name, e.g. 'vindicate-test'. ` +
        "Never the project root or an absolute path — omit project_dir entirely to scaffold into the opened folder."
    );
  }
  return trimmed;
}

function inProject(dir: string, rel: string): string {
  return dir === "." ? rel : `${dir}/${rel}`;
}

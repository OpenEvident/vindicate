import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ProjectFs } from "../../../src/fs/project-fs.js";
import { API_CONFIG_TEMPLATE, CLIENT_LOADER_TEMPLATE } from "./api-fixtures.js";
import { PAGE_CONFIG_TEMPLATE, PAGE_LOADER_TEMPLATE } from "./fixtures.js";

const trackedRoots: string[] = [];
const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TEMPLATES_DIR = path.join(RUNTIME_MCP_ROOT, "content", "templates");

export async function teardownProjectRoots(): Promise<void> {
  await Promise.all(trackedRoots.map((d) => rm(d, { recursive: true, force: true })));
  trackedRoots.length = 0;
}

export interface ProjectRoot {
  readonly root: string;
  readonly fs: ProjectFs;
}

type ScaffoldPreset = "minimal" | "production";
type ScaffoldLayer = "ui" | "api";

export interface CreateProjectRootOptions {
  readonly withBarrels?: boolean;
  readonly feature?: string;
  readonly scaffoldPreset?: ScaffoldPreset;
  /** Which layer's barrels/base classes to seed. Defaults to "ui" (unchanged prior behavior). */
  readonly layer?: ScaffoldLayer;
}

async function copyTemplate(root: string, from: string, to: string): Promise<void> {
  const content = await readFile(from, "utf8");
  const targetPath = path.join(root, to);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
}

async function seedMinimalScaffold(root: string): Promise<void> {
  await mkdir(path.join(root, "support", "config"), { recursive: true });
  await writeFile(path.join(root, "support/config/page-loader.ts"), PAGE_LOADER_TEMPLATE, "utf8");
  await writeFile(path.join(root, "support/config/page.config.ts"), PAGE_CONFIG_TEMPLATE, "utf8");
}

async function seedProductionScaffold(root: string): Promise<void> {
  // Templates live under content/templates/ui/ (split from content/templates/api/ so
  // scaffold_project can lay down UI, API, or both) — this seeds a UI-only production scaffold,
  // matching what these codegen-lab scenarios exercise.
  const uiTemplatesDir = path.join(TEMPLATES_DIR, "ui");
  await copyTemplate(root, path.join(uiTemplatesDir, "support/config/page-loader.ts"), "support/config/page-loader.ts");
  await copyTemplate(root, path.join(uiTemplatesDir, "support/config/page.config.ts"), "support/config/page.config.ts");
  await copyTemplate(root, path.join(uiTemplatesDir, "pages/BasePage.ts"), "pages/BasePage.ts");
  await copyTemplate(root, path.join(uiTemplatesDir, "panels/BasePanel.ts"), "panels/BasePanel.ts");
}

async function seedMinimalApiScaffold(root: string): Promise<void> {
  await mkdir(path.join(root, "support", "config"), { recursive: true });
  await writeFile(path.join(root, "support/config/client-loader.ts"), CLIENT_LOADER_TEMPLATE, "utf8");
  await writeFile(path.join(root, "support/config/api.config.ts"), API_CONFIG_TEMPLATE, "utf8");
}

async function seedProductionApiScaffold(root: string): Promise<void> {
  const apiTemplatesDir = path.join(TEMPLATES_DIR, "api");
  await copyTemplate(
    root,
    path.join(apiTemplatesDir, "support/config/client-loader.ts"),
    "support/config/client-loader.ts"
  );
  await copyTemplate(root, path.join(apiTemplatesDir, "support/config/api.config.ts"), "support/config/api.config.ts");
  await copyTemplate(root, path.join(apiTemplatesDir, "clients/BaseApiClient.ts"), "clients/BaseApiClient.ts");
}

export async function createProjectRoot(options?: CreateProjectRootOptions): Promise<ProjectRoot> {
  const root = path.join(os.tmpdir(), `vindicate-codegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  trackedRoots.push(root);
  await mkdir(root, { recursive: true });

  if (options?.withBarrels !== false) {
    const layer = options?.layer ?? "ui";
    const production = options?.scaffoldPreset === "production";
    if (layer === "api") {
      await (production ? seedProductionApiScaffold(root) : seedMinimalApiScaffold(root));
    } else {
      await (production ? seedProductionScaffold(root) : seedMinimalScaffold(root));
    }
  }

  const fs = new ProjectFs({ projectRoot: root, maxFileBytes: 1024 * 1024 });

  return { root, fs };
}

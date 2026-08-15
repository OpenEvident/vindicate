import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { scaffoldProject } from "../../src/harness/scaffold-project.js";
import { ProjectFs } from "../../src/fs/project-fs.js";

const UI_ONLY_TEMPLATES: Record<string, string> = {
  "pages/BasePage.ts": "export class BasePage {}"
};
const API_ONLY_TEMPLATES: Record<string, string> = {
  "clients/BaseApiClient.ts": "export abstract class BaseApiClient {}"
};
const SHARED_TEMPLATES: Record<string, string> = {
  "package.json": '{"name":"{{projectName}}"}',
  "playwright.config.ts":
    "import { defineConfig{{DEVICES_IMPORT}} } from '@playwright/test';\n" +
    "export default defineConfig({ use: { baseURL: process.env.BASE_URL },\n" +
    "{{BROWSER_USE_BLOCK}}{{PROJECTS_BLOCK}}});",
  ".github/workflows/vindicate-tests.yml": "name: vindicate\n{{envVarsBlock}}\n{{secretVarsBlock}}",
  "bitbucket-pipelines.yml":
    "image: node:20\npipelines:\n  default:\n    - step:\n        script:\n          - npm test",
  ".gitlab-ci.yml": "image: node\n{{envVarsBlock}}\n{{secretVarsBlock}}",
  ".circleci/config.yml":
    "workflows:\n  vindicate_ci:\n    jobs:\n      - vindicate_playwright_tests\n{{envVarsBlock}}\n{{secretVarsBlock}}",
  gitignore: "node_modules/\n"
};

vi.mock("../../src/scaffold/template-loader.js", () => ({
  loadScaffoldTemplates: vi.fn(async (target: "ui" | "api" | "both" = "ui") => ({
    ...SHARED_TEMPLATES,
    ...(target === "ui" || target === "both" ? UI_ONLY_TEMPLATES : {}),
    ...(target === "api" || target === "both" ? API_ONLY_TEMPLATES : {})
  }))
}));

describe("scaffoldProject", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  async function makeProjectFs(): Promise<{ fs: ProjectFs; root: string }> {
    const root = path.join(os.tmpdir(), `vindicate-scaffold-${Date.now()}-${Math.random()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    return { fs: new ProjectFs({ projectRoot: root, maxFileBytes: 512_000 }), root };
  }

  it("writes core files for github CI", async () => {
    const { fs } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "github",
      target: "ui"
    });
    expect(result.structure_valid).toBe(true);
    expect(result.filesCreated).toContain("package.json");
    expect(result.filesCreated).toContain("playwright.config.ts");
    expect(result.filesCreated).toContain(".env");
    expect(result.filesCreated).toContain(".env.example");
    expect(result.filesCreated).toContain(".gitignore");
    expect(result.filesCreated).toContain(".github/workflows/vindicate-tests.yml");
    expect(result.filesCreated).not.toContain("bitbucket-pipelines.yml");
    expect(result.filesCreated).toContain(".vindicate/config.json");
    expect(result.skipped).not.toContain(".gitlab-ci.yml");

    const env = await fs.read(".env");
    expect(env).toContain("BASE_URL=https://app.example.com");
    const envExample = await fs.read(".env.example");
    expect(envExample).toContain("BASE_URL=https://app.example.com");
    const gitignore = await fs.read(".gitignore");
    expect(gitignore).toContain(".env");
    expect(result.filesCreated).not.toContain(".gitlab-ci.yml");
    const config = await fs.read(".vindicate/config.json");
    expect(JSON.parse(config)).toEqual({ projectRoot: ".", target: "ui" });
  });

  it("writes gitlab CI file for gitlab platform", async () => {
    const { fs } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "gitlab",
      target: "ui"
    });
    expect(result.filesCreated).toContain(".gitlab-ci.yml");
    expect(result.filesCreated).not.toContain(".github/workflows/vindicate-tests.yml");
    expect(result.filesCreated).not.toContain("bitbucket-pipelines.yml");
    expect(result.filesCreated).not.toContain(".circleci/config.yml");
  });

  it("writes bitbucket pipeline file for bitbucket platform", async () => {
    const { fs } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "bitbucket",
      target: "ui"
    });
    expect(result.filesCreated).toContain("bitbucket-pipelines.yml");
    expect(result.filesCreated).not.toContain(".github/workflows/vindicate-tests.yml");
    expect(result.filesCreated).not.toContain(".gitlab-ci.yml");
    expect(result.filesCreated).not.toContain(".circleci/config.yml");
  });

  it("writes circleci config for circleci platform", async () => {
    const { fs } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "circleci",
      target: "ui"
    });
    expect(result.filesCreated).toContain(".circleci/config.yml");
    expect(result.filesCreated).not.toContain(".github/workflows/vindicate-tests.yml");
    expect(result.filesCreated).not.toContain("bitbucket-pipelines.yml");
    expect(result.filesCreated).not.toContain(".gitlab-ci.yml");
  });

  it("skips CI workflow files when ci platform is other", async () => {
    const { fs } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "other",
      target: "ui"
    });
    expect(result.filesCreated).not.toContain(".github/workflows/vindicate-tests.yml");
    expect(result.filesCreated).not.toContain("bitbucket-pipelines.yml");
    expect(result.filesCreated).not.toContain(".gitlab-ci.yml");
    expect(result.filesCreated).not.toContain(".circleci/config.yml");
  });

  it("does not duplicate BASE_URL in generated github workflow env block", async () => {
    const { fs } = await makeProjectFs();
    await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "github",
      target: "ui",
      envVars: ["BASE_URL", "BASE_URL", "TEST_EMAIL"],
      secretVars: ["TEST_PASSWORD"]
    });
    const workflow = await fs.read(".github/workflows/vindicate-tests.yml");
    expect(workflow).not.toContain("vars.BASE_URL");
    expect(workflow).toContain("TEST_EMAIL");
    expect(workflow).toContain("TEST_PASSWORD");
  });

  it("skips existing files when overwrite is false", async () => {
    const { fs, root } = await makeProjectFs();
    await writeFile(path.join(root, "package.json"), '{"name":"existing"}', "utf8");
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "github",
      target: "ui",
      overwrite: false
    });
    expect(result.skipped).toContain("package.json");
    const pkg = await readFile(path.join(root, "package.json"), "utf8");
    expect(pkg).toBe('{"name":"existing"}');
  });

  it("overwrites existing files when overwrite is true", async () => {
    const { fs, root } = await makeProjectFs();
    await writeFile(path.join(root, "package.json"), '{"name":"existing"}', "utf8");
    await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "github",
      target: "ui",
      overwrite: true
    });
    const pkg = await readFile(path.join(root, "package.json"), "utf8");
    expect(pkg).toContain("vindicate-tests");
  });

  it("creates standard directories with gitkeep files", async () => {
    const { fs, root } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "other",
      target: "ui"
    });
    for (const rel of [
      "tests/.gitkeep",
      "support/config/.gitkeep",
      "pages/.gitkeep",
      "panels/.gitkeep",
      "support/data/.gitkeep",
      ".vindicate/.gitkeep"
    ]) {
      expect(result.filesCreated).toContain(rel);
      await readFile(path.join(root, rel), "utf8");
    }
  });

  it("scaffolds into a subdirectory when project_dir is given", async () => {
    const { fs, root } = await makeProjectFs();
    const result = await scaffoldProject(fs, {
      baseUrl: "https://app.example.com",
      ciPlatform: "github",
      target: "ui",
      projectDir: "vindicate-test"
    });
    expect(result.structure_valid).toBe(true);
    // core files live under the subdir
    expect(result.filesCreated).toContain("vindicate-test/package.json");
    expect(result.filesCreated).toContain("vindicate-test/.env");
    expect(result.filesCreated).toContain("vindicate-test/pages/BasePage.ts");
    expect(result.filesCreated).toContain("vindicate-test/tests/.gitkeep");
    // config.json always at CWD root (unprefixed)
    expect(result.filesCreated).toContain(".vindicate/config.json");
    const config = await fs.read(".vindicate/config.json");
    expect(JSON.parse(config)).toEqual({ projectRoot: "vindicate-test", target: "ui" });
    // subdir files really exist on disk
    await readFile(path.join(root, "vindicate-test", "package.json"), "utf8");
    await readFile(path.join(root, "vindicate-test", ".env"), "utf8");
    // no files leaked to CWD root (except .vindicate/config.json)
    await expect(readFile(path.join(root, "package.json"), "utf8")).rejects.toThrow();
  });

  it("rejects absolute or traversal project_dir", async () => {
    const { fs } = await makeProjectFs();
    await expect(
      scaffoldProject(fs, {
        baseUrl: "https://app.example.com",
        ciPlatform: "github",
        target: "ui",
        projectDir: "../escape"
      })
    ).rejects.toThrow("Invalid project_dir");
  });

  describe("target", () => {
    it("target 'ui' writes ui files, skips api files, and keeps browser config", async () => {
      const { fs } = await makeProjectFs();
      const result = await scaffoldProject(fs, {
        baseUrl: "https://app.example.com",
        ciPlatform: "github",
        target: "ui"
      });
      expect(result.filesCreated).toContain("pages/BasePage.ts");
      expect(result.filesCreated).not.toContain("clients/BaseApiClient.ts");
      const playwrightConfig = await fs.read("playwright.config.ts");
      expect(playwrightConfig).toContain(", devices");
      expect(playwrightConfig).toContain("projects:");
    });

    it("target 'api' writes api files, skips ui files, and strips browser-only config", async () => {
      const { fs } = await makeProjectFs();
      const result = await scaffoldProject(fs, {
        baseUrl: "https://app.example.com",
        ciPlatform: "github",
        target: "api"
      });
      expect(result.filesCreated).toContain("clients/BaseApiClient.ts");
      expect(result.filesCreated).not.toContain("pages/BasePage.ts");
      expect(result.filesCreated).toContain("clients/.gitkeep");
      expect(result.filesCreated).toContain("builders/.gitkeep");
      expect(result.filesCreated).not.toContain("pages/.gitkeep");
      expect(result.filesCreated).not.toContain("panels/.gitkeep");

      const playwrightConfig = await fs.read("playwright.config.ts");
      expect(playwrightConfig).not.toContain("devices");
      expect(playwrightConfig).not.toContain("projects:");

      const config = await fs.read(".vindicate/config.json");
      expect(JSON.parse(config)).toEqual({ projectRoot: ".", target: "api" });

      const envExample = await fs.read(".env.example");
      expect(envExample).toContain("API_BASE_URL");
    });

    it("target 'both' writes ui and api files together, keeps browser config", async () => {
      const { fs } = await makeProjectFs();
      const result = await scaffoldProject(fs, {
        baseUrl: "https://app.example.com",
        ciPlatform: "github",
        target: "both"
      });
      expect(result.filesCreated).toContain("pages/BasePage.ts");
      expect(result.filesCreated).toContain("clients/BaseApiClient.ts");
      expect(result.filesCreated).toContain("pages/.gitkeep");
      expect(result.filesCreated).toContain("clients/.gitkeep");

      const playwrightConfig = await fs.read("playwright.config.ts");
      expect(playwrightConfig).toContain(", devices");
      expect(playwrightConfig).toContain("projects:");

      const config = await fs.read(".vindicate/config.json");
      expect(JSON.parse(config)).toEqual({ projectRoot: ".", target: "both" });
    });

    it("target 'ui' omits the API_BASE_URL hint from .env.example", async () => {
      const { fs } = await makeProjectFs();
      await scaffoldProject(fs, {
        baseUrl: "https://app.example.com",
        ciPlatform: "github",
        target: "ui"
      });
      const envExample = await fs.read(".env.example");
      expect(envExample).not.toContain("API_BASE_URL");
    });
  });
});

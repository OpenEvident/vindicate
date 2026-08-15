import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`TypeScript compile check failed (exit ${code}).\n${stderr || stdout}`));
    });
  });
}

async function ensureFile(root: string, relativePath: string, sourcePath: string): Promise<void> {
  const targetPath = path.join(root, relativePath);
  try {
    await access(targetPath);
  } catch {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

export async function compileGeneratedProject(root: string): Promise<void> {
  // Templates live under content/templates/ui/ (split from content/templates/api/ so
  // scaffold_project can lay down UI, API, or both) — this compile-check seeds the UI base classes,
  // matching what these codegen-lab scenarios generate against.
  const templatesDir = path.resolve(RUNTIME_MCP_ROOT, "content", "templates", "ui");
  await ensureFile(root, "pages/BasePage.ts", path.join(templatesDir, "pages/BasePage.ts"));
  await ensureFile(root, "panels/BasePanel.ts", path.join(templatesDir, "panels/BasePanel.ts"));

  const templatePath = path.resolve(
    RUNTIME_MCP_ROOT,
    "tests/codegen-lab/tsconfig.codegen-lab.json"
  );
  const templateRaw = await readFile(templatePath, "utf8");
  const template = JSON.parse(templateRaw) as Record<string, unknown>;

  const generatedConfig = {
    ...template,
    compilerOptions: {
      ...((template.compilerOptions as Record<string, unknown>) ?? {}),
      baseUrl: ".",
      paths: {
        "@config/page.config": ["types/config-page-config.d.ts"],
        "@config/page-loader": ["types/config-page-loader.d.ts"]
      }
    },
    include: [
      "pages/**/*.ts",
      "panels/**/*.ts",
      "tests/**/*.ts",
      "auth.setup.ts",
      "types/**/*.d.ts"
    ]
  };
  await writeFile(
    path.join(root, "tsconfig.codegen-lab.generated.json"),
    `${JSON.stringify(generatedConfig, null, 2)}\n`,
    "utf8"
  );
  await mkdir(path.join(root, "types"), { recursive: true });
  await writeFile(
    path.join(root, "types", "playwright-test.d.ts"),
    `declare module '@playwright/test' {
  export interface Response {
    url(): string;
  }

  export interface Dialog {
    accept(): Promise<void>;
    dismiss(): Promise<void>;
  }

  export interface BrowserContext {
    storageState(options: { path: string }): Promise<void>;
  }

  export interface Keyboard {
    press(key: string): Promise<void>;
  }

  export interface Mouse {
    move(x: number, y: number, options?: { steps?: number }): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
  }

  export interface Page {
    goto(url: string): Promise<void>;
    locator(selector: string): Locator;
    getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator;
    getByTestId(testId: string): Locator;
    getByText(text: string, options?: { exact?: boolean }): Locator;
    getByLabel(text: string, options?: { exact?: boolean }): Locator;
    getByPlaceholder(text: string, options?: { exact?: boolean }): Locator;
    waitForLoadState(state?: string): Promise<void>;
    waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void>;
    waitForResponse(predicate: (response: Response) => boolean): Promise<void>;
    title(): Promise<string>;
    screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
    on(event: 'dialog', handler: (dialog: Dialog) => void): void;
    context(): BrowserContext;
    keyboard: Keyboard;
    mouse: Mouse;
  }

  export interface Locator {
    getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator;
    getByTestId(testId: string): Locator;
    getByText(text: string, options?: { exact?: boolean }): Locator;
    getByLabel(text: string, options?: { exact?: boolean }): Locator;
    getByPlaceholder(text: string, options?: { exact?: boolean }): Locator;
    waitFor(options: { state: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
    fill(value: string): Promise<void>;
    click(): Promise<void>;
    hover(): Promise<void>;
    check(): Promise<void>;
    uncheck(): Promise<void>;
    selectOption(value: string): Promise<void>;
    setInputFiles(files: string[]): Promise<void>;
    dblclick(): Promise<void>;
    scrollIntoViewIfNeeded(): Promise<void>;
    dragTo(target: Locator): Promise<void>;
    boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  }

  export interface TestInfo {
    attach(name: string, payload: { body: Buffer; contentType: string }): Promise<void>;
  }

  export interface TestFn {
    (name: string, fn: (fixtures: any) => Promise<void> | void): void;
    describe(name: string, fn: () => void): void;
    beforeEach(fn: (fixtures: any) => Promise<void> | void): void;
    use(options: any): void;
    extend<T>(fixtures: any): TestFn;
    skip(name: string, fn: (fixtures: any) => Promise<void> | void): void;
    fixme(name: string, fn: (fixtures: any) => Promise<void> | void): void;
  }

  export const test: TestFn;
  export function expect(value: any): Record<string, (...args: unknown[]) => Promise<void> | void>;
}
`,
    "utf8"
  );
  await writeFile(
    path.join(root, "types", "config-page-config.d.ts"),
    `declare module '@config/page.config' {
  export const test: {
    describe(name: string, fn: () => void): void;
    beforeEach(fn: (fixtures: any) => Promise<void> | void): void;
    use(options: any): void;
    (name: string, fn: (fixtures: any) => Promise<void> | void): void;
    skip(name: string, fn: (fixtures: any) => Promise<void> | void): void;
    fixme(name: string, fn: (fixtures: any) => Promise<void> | void): void;
  };
}
`,
    "utf8"
  );
  const pageClasses: string[] = [];
  for (const dir of ["pages", "panels"]) {
    try {
      const entries = await readdir(path.join(root, dir), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const pageClass = entry.name.replace(/\.ts$/, "");
        if (pageClass.startsWith("Base")) continue;
        pageClasses.push(pageClass);
      }
    } catch {
      // ignore missing directory
    }
  }
  const uniquePageClasses = [...new Set(pageClasses)].sort((a, b) => a.localeCompare(b));
  const loaderDecl = uniquePageClasses
    .map((pageClass) => `  export class ${pageClass} { constructor(page: any); [k: string]: any; }`)
    .join("\n");
  const expectedDecls: string[] = [];
  try {
    const dataDirs = await readdir(path.join(root, "support", "data"), { withFileTypes: true });
    for (const dir of dataDirs) {
      if (!dir.isDirectory()) continue;
      const expectedPath = path.join(root, "support", "data", dir.name, "expected.json");
      try {
        await access(expectedPath);
        const featureCamel = dir.name.replace(/[-_](.)/g, (_m, c: string) => c.toUpperCase());
        expectedDecls.push(`  export const ${featureCamel}Expected: any;`);
      } catch {
        // no expected file for this feature
      }
    }
  } catch {
    // support/data not present
  }
  await writeFile(
    path.join(root, "types", "config-page-loader.d.ts"),
    `declare module '@config/page-loader' {
${loaderDecl}
${expectedDecls.join("\n")}
}
`,
    "utf8"
  );

  const tscBin = require.resolve("typescript/bin/tsc");
  await runCommand(
    process.execPath,
    [tscBin, "-p", "tsconfig.codegen-lab.generated.json", "--noEmit"],
    root
  );
}

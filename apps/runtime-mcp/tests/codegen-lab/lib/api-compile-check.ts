import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real `tsc --noEmit` compile check for `create_api`-generated projects — the api-layer
 * equivalent of compile-check.ts's `compileGeneratedProject`. Smaller than the UI version: the
 * `@clients/*`/`@builders/*`/`@config/api.config` path-aliased files already exist for real on
 * disk (the generator wrote them into `root`), so only `@playwright/test`'s request-side surface
 * (APIRequestContext et al. — the only part of that package API-generated code touches) needs an
 * ambient shim, since neither `@playwright/test` nor `playwright-core` is a runtime-mcp dependency.
 * A syntax-only check (`ts.createSourceFile`) can't catch a real type error like a malformed
 * identifier interpolated into `process.env.X` (subtraction parses fine, only the type checker
 * flags the undeclared name) — this closes that gap.
 */

const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);

const PLAYWRIGHT_TEST_SHIM = `declare module '@playwright/test' {
  export interface APIResponse {
    status(): number;
    statusText(): string;
    ok(): boolean;
    headers(): Record<string, string>;
    text(): Promise<string>;
    json(): Promise<any>;
  }

  export interface APIRequestContext {
    get(url: string, options?: any): Promise<APIResponse>;
    post(url: string, options?: any): Promise<APIResponse>;
    put(url: string, options?: any): Promise<APIResponse>;
    patch(url: string, options?: any): Promise<APIResponse>;
    delete(url: string, options?: any): Promise<APIResponse>;
    head(url: string, options?: any): Promise<APIResponse>;
    fetch(url: string, options?: any): Promise<APIResponse>;
    dispose(): Promise<void>;
  }

  export const request: {
    newContext(options?: any): Promise<APIRequestContext>;
  };

  export interface TestFn {
    (name: string, fn: (fixtures: any) => Promise<void> | void): void;
    describe(name: string, fn: () => void): void;
    beforeEach(fn: (fixtures: any) => Promise<void> | void): void;
    use(options: any): void;
    extend<F, W = {}>(fixtures: any): TestFn;
    skip(name: string, fn: (fixtures: any) => Promise<void> | void): void;
    fixme(name: string, fn: (fixtures: any) => Promise<void> | void): void;
  }

  export const test: TestFn;
  export function expect(value: any): Record<string, (...args: unknown[]) => Promise<void> | void>;
}
`;

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

export async function compileGeneratedApiProject(root: string): Promise<void> {
  const templatePath = path.resolve(RUNTIME_MCP_ROOT, "tests/codegen-lab/tsconfig.codegen-lab.json");
  const templateRaw = await readFile(templatePath, "utf8");
  const template = JSON.parse(templateRaw) as Record<string, unknown>;

  const generatedConfig = {
    ...template,
    compilerOptions: {
      ...((template.compilerOptions as Record<string, unknown>) ?? {}),
      baseUrl: ".",
      paths: {
        "@clients/*": ["clients/*"],
        "@builders/*": ["builders/*"],
        "@config/*": ["support/config/*"]
      },
      // The generated project lives in a bare temp dir with no node_modules of its own — point at
      // runtime-mcp's real @types/node so `process.env` (auth_setup credentials) type-checks, and
      // supply it explicitly since a bare `types: ["node"]` alone can't resolve without typeRoots
      // from a directory with no ancestor node_modules/@types.
      types: ["node"],
      typeRoots: [path.join(RUNTIME_MCP_ROOT, "node_modules/@types")],
      // The PLAYWRIGHT_TEST_SHIM's `extend(fixtures: any)` doesn't replicate real Playwright's
      // fixture-dependency type inference (a faithful shim would need to mirror its full generic
      // machinery), so each fixture callback's destructured deps/`use` param can't be inferred and
      // would trip noImplicitAny on every single fixture — a false positive from the shim, not a
      // real bug in generated code. strictNullChecks/strictFunctionTypes/etc. (still on via
      // `strict`) are what actually catch real type errors here, e.g. a builder's target_type
      // missing a required field.
      noImplicitAny: false
    },
    include: ["clients/**/*.ts", "builders/**/*.ts", "tests/**/*.ts", "support/**/*.ts", "types/**/*.d.ts"]
  };
  await writeFile(
    path.join(root, "tsconfig.codegen-lab-api.generated.json"),
    `${JSON.stringify(generatedConfig, null, 2)}\n`,
    "utf8"
  );

  await mkdir(path.join(root, "types"), { recursive: true });
  await writeFile(path.join(root, "types", "playwright-test.d.ts"), PLAYWRIGHT_TEST_SHIM, "utf8");

  const tscBin = require.resolve("typescript/bin/tsc");
  await runCommand(process.execPath, [tscBin, "-p", "tsconfig.codegen-lab-api.generated.json", "--noEmit"], root);
}

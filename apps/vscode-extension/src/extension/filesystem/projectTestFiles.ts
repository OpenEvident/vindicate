import { readdir } from "node:fs/promises";
import path from "node:path";

/** Suffixes for Playwright test files under the project `tests/` folder (Vindicate contract C10). */
export const PROJECT_TEST_SUFFIXES = [
  ".spec.ts",
  ".test.ts",
  ".e2e.ts",
  ".spec.js",
  ".test.js",
  ".e2e.js"
] as const;

/** Glob-style label shown in onboarding UI — matches recursive discovery under `tests/`. */
export const PROJECT_TEST_GLOB_LABEL = "tests/**/*.spec.ts";

/**
 * Collect test files only under `<workspaceRoot>/tests/` (flat or one section level deep).
 * Does not scan the whole workspace — aligns with Vindicate's `tests/` allowlist.
 */
export async function collectProjectTestFiles(workspaceRoot: string): Promise<string[]> {
  const testsDir = path.join(workspaceRoot, "tests");
  return collectTestFilesUnder(testsDir);
}

export function isProjectTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return PROJECT_TEST_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

async function collectTestFilesUnder(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTestFilesUnder(fullPath, files);
      continue;
    }
    if (isProjectTestFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * @file Detect whether the repo contains application-under-test UI source (not test harness).
 */
import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

const COMPONENT_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", ".html"]);

/** Vindicate / Playwright harness dirs — not the product app. */
export const HARNESS_PATH_PREFIXES = ["pages/", "panels/", "support/", "tests/"] as const;

const APP_ROOT_DIRS = ["app", "components"] as const;

function normalizeRel(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function isHarnessPath(relativePath: string): boolean {
  const norm = normalizeRel(relativePath);
  return HARNESS_PATH_PREFIXES.some((prefix) => norm.startsWith(prefix));
}

function isComponentFile(fileName: string): boolean {
  return COMPONENT_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function isDirectory(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}

async function hasQualifyingFileUnder(
  projectRoot: string,
  relativeDir: string,
  excludeHarness: boolean
): Promise<boolean> {
  const absDir = path.join(projectRoot, relativeDir);
  if (!(await isDirectory(absDir))) {
    return false;
  }

  let entries: Dirent[];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const rel = normalizeRel(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      if (await hasQualifyingFileUnder(projectRoot, rel, excludeHarness)) {
        return true;
      }
      continue;
    }
    if (!entry.isFile() || !isComponentFile(entry.name)) {
      continue;
    }
    if (excludeHarness && isHarnessPath(rel)) {
      continue;
    }
    return true;
  }

  return false;
}

/**
 * Returns true when the project root contains UI source for the application under test.
 * Excludes Vindicate/Playwright harness paths (`pages/`, `panels/`, `support/`, `tests/`).
 */
export async function hasAppUiSource(projectRoot: string): Promise<boolean> {
  for (const dir of APP_ROOT_DIRS) {
    if (await hasQualifyingFileUnder(projectRoot, dir, false)) {
      return true;
    }
  }
  return hasQualifyingFileUnder(projectRoot, "src", true);
}

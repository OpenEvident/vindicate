/**
 * @file Resolve project-relative paths under a given project root, blocking
 * escapes outside it. Used by the session-scoped file routes, where the root
 * comes from the session record rather than a fixed process-level value.
 */
import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

import { FilesOutsideRootError } from "../../shared/errors/worker.errors.js";

export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativePath.replace(/^[/\\]+/, ""));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FilesOutsideRootError(relativePath);
  }
  return target;
}

/**
 * Resolves paths under project root and blocks symlink escapes.
 */
export async function resolveProjectPathSecure(
  projectRoot: string,
  relativePath: string
): Promise<string> {
  const target = resolveProjectPath(projectRoot, relativePath);
  const rootReal = await realpath(path.resolve(projectRoot));
  let containmentPath = path.dirname(target);
  try {
    const targetStat = await lstat(target);
    if (targetStat.isDirectory()) {
      containmentPath = target;
    }
  } catch {
    // Non-existent target is validated against nearest existing parent.
  }
  const parentReal = await findExistingRealParent(containmentPath);
  const withinParent = path.relative(rootReal, parentReal);
  if (withinParent.startsWith("..") || path.isAbsolute(withinParent)) {
    throw new FilesOutsideRootError(relativePath);
  }
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      const targetReal = await realpath(target);
      const rel = path.relative(rootReal, targetReal);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new FilesOutsideRootError(relativePath);
      }
    }
  } catch {
    // Non-existent files are allowed for write paths.
  }
  return target;
}

async function findExistingRealParent(startDir: string): Promise<string> {
  let current = startDir;
  for (;;) {
    try {
      return await realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error("Unable to resolve real path for project root ancestry");
      }
      current = parent;
    }
  }
}

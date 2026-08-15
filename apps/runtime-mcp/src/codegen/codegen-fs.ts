/**
 * @file Shared, layer-agnostic write/anchor/project-scoping plumbing — extracted out of
 * generator.ts (UI) so api-generator.ts (API) can reuse it verbatim instead of duplicating it.
 * Nothing here knows about pages or clients; it only moves bytes and finds anchor comments.
 */
import type { ProjectFs } from "../fs/project-fs.js";
import { CodegenStructuralError, FileNotFoundError } from "../shared/errors.js";

export interface WriteEntry {
  readonly path: string;
  readonly content: string;
}

export async function flushWrites(fs: ProjectFs, writes: WriteEntry[]): Promise<string[]> {
  const written: string[] = [];
  for (const { path, content } of writes) {
    await fs.write(path, content);
    written.push(path);
  }
  return written;
}

export function insertAfterAnchor(content: string, anchor: string, insertion: string): string {
  const idx = content.indexOf(anchor);
  if (idx === -1) {
    throw new CodegenStructuralError(
      `Barrel anchor not found: '${anchor}'`,
      "The project's barrel file may have been manually edited. Restore the anchor comment or re-scaffold the project."
    );
  }
  const insertAt = idx + anchor.length;
  return `${content.slice(0, insertAt)}\n${insertion}${content.slice(insertAt)}`;
}

export function insertBeforeAnchor(content: string, anchor: string, insertion: string): string {
  const idx = content.indexOf(anchor);
  if (idx === -1) {
    throw new CodegenStructuralError(
      `Barrel anchor not found: '${anchor}'`,
      "The project's barrel file may have been manually edited. Restore the anchor comment or re-scaffold the project."
    );
  }
  return `${content.slice(0, idx)}${insertion}\n${content.slice(idx)}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fileExists(fs: ProjectFs, relativePath: string): Promise<boolean> {
  try {
    await fs.read(relativePath);
    return true;
  } catch (err: unknown) {
    if (err instanceof FileNotFoundError) {
      return false;
    }
    throw err;
  }
}

/**
 * Returns a ProjectFs whose `write` method calls `guard(relativePath)` before
 * every write. Uses prototype delegation so all other methods are unchanged.
 */
export function applyPathGuard(
  fs: ProjectFs,
  guard: (relativePath: string) => Promise<void>
): ProjectFs {
  const proxy = Object.create(fs) as ProjectFs;
  proxy.write = async (relativePath: string, content: string): Promise<void> => {
    await guard(relativePath);
    return fs.write(relativePath, content);
  };
  return proxy;
}

export async function readProjectRoot(fs: ProjectFs): Promise<string> {
  try {
    const raw = await fs.read(".vindicate/config.json");
    const parsed = JSON.parse(raw) as { projectRoot?: string };
    const root = parsed.projectRoot?.trim();
    return root && root !== "." ? root : ".";
  } catch {
    return ".";
  }
}

export function projectScopedFs(fs: ProjectFs, projectRoot: string): ProjectFs {
  if (projectRoot === ".") return fs;
  const proxy = Object.create(fs) as ProjectFs;
  proxy.read = (rel: string) => fs.read(`${projectRoot}/${rel}`);
  proxy.write = (rel: string, content: string) => fs.write(`${projectRoot}/${rel}`, content);
  return proxy;
}

/** Resolves the effective, project-root-scoped, (optionally) path-guarded fs for a generator run. */
export async function resolveEffectiveFs(
  fs: ProjectFs,
  pathGuard?: (relativePath: string) => Promise<void>
): Promise<ProjectFs> {
  const projectRoot = await readProjectRoot(fs);
  const scoped = projectScopedFs(fs, projectRoot);
  return pathGuard !== undefined ? applyPathGuard(scoped, pathGuard) : scoped;
}

/**
 * @file Project-scoped file I/O with path guard and size limits.
 */
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  FileNotFoundError,
  FileOutsideRootError,
  FileTooLargeError,
  StringNotFoundError
} from "../shared/errors.js";

export interface ProjectFsConfig {
  readonly projectRoot: string;
  readonly claudeProjectDir?: string;
  readonly maxFileBytes: number;
}

export interface DirEntry {
  readonly name: string;
  readonly type: "file" | "directory";
}

export class ProjectFs {
  private readonly root: string;
  private readonly maxFileBytes: number;

  constructor(cfg: ProjectFsConfig) {
    const root = cfg.projectRoot.trim().length > 0 ? cfg.projectRoot : cfg.claudeProjectDir;
    if (root === undefined || root.trim().length === 0) {
      throw new Error("VINDICATE_PROJECT_ROOT or CLAUDE_PROJECT_DIR must be set");
    }
    this.root = path.resolve(root);
    this.maxFileBytes = cfg.maxFileBytes;
  }

  resolveSafe(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    if (path.isAbsolute(normalized)) {
      throw new FileOutsideRootError(normalized);
    }
    const resolved = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new FileOutsideRootError(relativePath);
    }
    return resolved;
  }

  async read(relativePath: string): Promise<string> {
    const abs = this.resolveSafe(relativePath);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(abs);
    } catch {
      throw new FileNotFoundError(relativePath);
    }
    if (info.size > this.maxFileBytes) {
      throw new FileTooLargeError(this.maxFileBytes);
    }
    return readFile(abs, "utf8");
  }

  async write(relativePath: string, content: string): Promise<void> {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > this.maxFileBytes) {
      throw new FileTooLargeError(this.maxFileBytes);
    }
    const abs = this.resolveSafe(relativePath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }

  async list(relativePath = "."): Promise<DirEntry[]> {
    const abs = this.resolveSafe(relativePath);
    let names: Dirent<string>[];
    try {
      names = await readdir(abs, { withFileTypes: true, encoding: "utf8" });
    } catch {
      throw new FileNotFoundError(relativePath);
    }
    return names.map((d) => ({
      name: d.name,
      type: d.isDirectory() ? ("directory" as const) : ("file" as const)
    }));
  }

  async replaceFirst(relativePath: string, oldString: string, newString: string): Promise<void> {
    const content = await this.read(relativePath);
    const index = content.indexOf(oldString);
    if (index < 0) {
      throw new StringNotFoundError(relativePath);
    }
    const updated = content.slice(0, index) + newString + content.slice(index + oldString.length);
    await this.write(relativePath, updated);
  }

  async delete(relativePath: string): Promise<void> {
    const abs = this.resolveSafe(relativePath);
    try {
      await stat(abs);
    } catch {
      throw new FileNotFoundError(relativePath);
    }
    await unlink(abs);
  }

  async search(globPattern: string): Promise<string[]> {
    const results: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      const abs = path.join(this.root, dir);
      const entries = await readdir(abs, { withFileTypes: true });
      for (const entry of entries) {
        const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), rel);
        } else if (matchGlob(globPattern, rel.replace(/\\/g, "/"))) {
          results.push(rel);
        }
      }
    };
    await walk(".", "");
    return results;
  }

}

function matchGlob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(value);
}

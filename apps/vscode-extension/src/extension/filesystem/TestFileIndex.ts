import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { collectProjectTestFiles } from "./projectTestFiles.js";
const DESCRIBE_PATTERN = /describe\s*\(\s*['"`]([^'"`]+)['"`]/gim;
const AC_TAG_PATTERN = /\bAC-(\d+)\b/gim;
const TEST_TITLE_PATTERN = /\btest\s*\(\s*['"`]([^'"`]+)['"`]/gim;

export interface TestFileSnapshot {
  filePath: string;
  relativePath: string;
  content: string;
  mtimeMs: number;
  describeBlocks: string[];
  acIds: Set<string>;
  testTitles: string[];
}

interface CacheEntry {
  mtimeMs: number;
  snapshot: TestFileSnapshot;
}

export class TestFileIndex {
  private cacheByPath = new Map<string, CacheEntry>();
  private root: string | null = null;

  clear(): void {
    this.cacheByPath.clear();
    this.root = null;
  }

  async snapshots(workspaceRoot: string): Promise<TestFileSnapshot[]> {
    if (this.root !== workspaceRoot) {
      this.clear();
      this.root = workspaceRoot;
    }

    const testFiles = await collectProjectTestFiles(workspaceRoot);
    const seen = new Set(testFiles);
    const nextCache = new Map<string, CacheEntry>();
    const results: TestFileSnapshot[] = [];

    for (const filePath of testFiles) {
      try {
        const fileStat = await stat(filePath);
        const cached = this.cacheByPath.get(filePath);
        if (cached && cached.mtimeMs === fileStat.mtimeMs) {
          nextCache.set(filePath, cached);
          results.push(cached.snapshot);
          continue;
        }

        const content = await readFile(filePath, "utf8");
        const snapshot = buildSnapshot(workspaceRoot, filePath, content, fileStat.mtimeMs);
        const entry = { mtimeMs: fileStat.mtimeMs, snapshot };
        nextCache.set(filePath, entry);
        results.push(snapshot);
      } catch {
        // File may be deleted/moved between scan and read; skip it this cycle.
      }
    }

    for (const filePath of this.cacheByPath.keys()) {
      if (!seen.has(filePath)) {
        // deleted test file -> drop from cache
      }
    }

    this.cacheByPath = nextCache;
    return results;
  }
}

function buildSnapshot(
  workspaceRoot: string,
  filePath: string,
  content: string,
  mtimeMs: number
): TestFileSnapshot {
  const describeBlocks = [...content.matchAll(DESCRIBE_PATTERN)].map((m) => (m[1] ?? "").toLowerCase());
  const acIds = new Set(
    [...content.matchAll(AC_TAG_PATTERN)]
      .map((m) => Number(m[1]))
      .filter(Number.isFinite)
      .map((id) => `AC-${id}`)
  );
  const testTitles = [...content.matchAll(TEST_TITLE_PATTERN)].map((m) => m[1] ?? "");

  return {
    filePath,
    relativePath: toRel(workspaceRoot, filePath),
    content,
    mtimeMs,
    describeBlocks,
    acIds,
    testTitles
  };
}

function toRel(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

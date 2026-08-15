import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TestFileSnapshot } from "./TestFileIndex";
import { collectProjectTestFiles } from "./projectTestFiles.js";

export interface ITraceabilityMatcher {
  match(
    featureName: string,
    workspaceRoot: string,
    snapshots?: TestFileSnapshot[]
  ): Promise<boolean>;
  matchAll(
    featureNames: string[],
    workspaceRoot: string,
    snapshots?: TestFileSnapshot[]
  ): Promise<Map<string, boolean>>;
}

const DESCRIBE_PATTERN = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;

export class TraceabilityMatcher implements ITraceabilityMatcher {
  async match(
    featureName: string,
    workspaceRoot: string,
    snapshots?: TestFileSnapshot[]
  ): Promise<boolean> {
    const map = await this.matchAll([featureName], workspaceRoot, snapshots);
    return map.get(featureName) ?? false;
  }

  async matchAll(
    featureNames: string[],
    workspaceRoot: string,
    snapshots?: TestFileSnapshot[]
  ): Promise<Map<string, boolean>> {
    const testFiles =
      snapshots?.map((snapshot) => snapshot.filePath) ??
      (await collectProjectTestFiles(workspaceRoot));
    const result = new Map<string, boolean>(featureNames.map((n) => [n, false]));

    const unmatched = featureNames.filter((n) => !filenameMatchesAny(testFiles, n));
    if (unmatched.length === 0) {
      for (const name of featureNames) result.set(name, true);
      return result;
    }

    // Filename pass: mark matched features
    for (const name of featureNames) {
      if (filenameMatchesAny(testFiles, name)) result.set(name, true);
    }

    // Content pass: read each file once and check all unmatched features
    const stillUnmatched = unmatched.filter((n) => !result.get(n));
    if (stillUnmatched.length > 0) {
      const entries = snapshots
        ? snapshots.map((snapshot) => ({
            filePath: snapshot.filePath,
            describes: snapshot.describeBlocks
          }))
        : await loadDescribeEntries(testFiles);

      for (const entry of entries) {
        const describes = entry.describes;
        for (const name of stillUnmatched) {
          if (result.get(name)) continue;
          const normalized = normalizeFeatureName(name);
          if (describes.some((d) => d.includes(normalized))) {
            result.set(name, true);
          }
        }
      }
    }

    return result;
  }
}

async function loadDescribeEntries(
  files: string[]
): Promise<Array<{ filePath: string; describes: string[] }>> {
  const entries: Array<{ filePath: string; describes: string[] }> = [];
  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    entries.push({
      filePath,
      describes: [...content.matchAll(DESCRIBE_PATTERN)].map((m) => (m[1] ?? "").toLowerCase())
    });
  }
  return entries;
}

function normalizeFeatureName(name: string): string {
  return name
    .replace(/-feature$/i, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function filenameMatchesAny(files: string[], featureName: string): boolean {
  const normalized = normalizeFeatureName(featureName);
  const feature = normalized.replace(/[-_]/g, "");
  return files.some((filePath) => {
    const base = path.basename(filePath).toLowerCase();
    const stripped = base.replace(/\.(spec|test|e2e)\.ts$/i, "").replace(/[-_]/g, "");
    return stripped.includes(feature) || feature.includes(stripped);
  });
}

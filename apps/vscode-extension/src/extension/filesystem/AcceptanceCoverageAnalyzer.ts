import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AcceptanceCriteriaCoverage } from "../../shared/types";
import type { SpecFeatureAnalysis } from "./SpecAnalyzer";
import type { TestFileSnapshot } from "./TestFileIndex";
import { collectProjectTestFiles } from "./projectTestFiles.js";

const AC_TAG_PATTERN = /\[?\bAC-(\d+)\b\]?/gim;
const DESCRIBE_PATTERN = /describe\s*\(\s*['"`]([^'"`]+)['"`]/gim;

export async function calculateAcceptanceCoverage(
  workspaceRoot: string,
  features: SpecFeatureAnalysis[],
  snapshots?: TestFileSnapshot[]
): Promise<AcceptanceCriteriaCoverage> {
  const resolvedSnapshots = snapshots ?? (await loadSnapshotsFromDisk(workspaceRoot));

  let total = 0;
  let covered = 0;
  let drift = 0;

  for (const feature of features) {
    // Deprecated stories are retired — skip coverage computation for them
    if (feature.storyStatus === "deprecated") continue;

    const specAcIds = new Set(feature.acIds);
    total += specAcIds.size;

    if (specAcIds.size === 0) continue;

    const related = relatedTests(feature.name, resolvedSnapshots);
    const mentioned = new Set<string>();
    const unknown = new Set<string>();

    for (const snapshot of related) {
      for (const acId of snapshot.acIds) {
        if (specAcIds.has(acId)) {
          mentioned.add(acId);
        } else {
          unknown.add(acId);
        }
      }
    }

    covered += mentioned.size;
    drift += unknown.size;

    // Spec changed after tests and not all ACs are represented => likely stale test mapping.
    if (related.length > 0 && mentioned.size < specAcIds.size) {
      const newestTestMtime = Math.max(...related.map((r) => r.mtimeMs));
      if (newestTestMtime < feature.specMtimeMs) {
        drift += 1;
      }
    }
  }

  const missing = Math.max(total - covered, 0);
  return { total, covered, drift, missing };
}

async function loadSnapshotsFromDisk(workspaceRoot: string): Promise<TestFileSnapshot[]> {
  const testFiles = await collectProjectTestFiles(workspaceRoot);
  return Promise.all(testFiles.map((filePath) => loadTestSnapshot(workspaceRoot, filePath)));
}

async function loadTestSnapshot(workspaceRoot: string, filePath: string): Promise<TestFileSnapshot> {
  const [content, info] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
  const describeBlocks = [...content.matchAll(DESCRIBE_PATTERN)].map((m) => (m[1] ?? "").toLowerCase());
  const acIds = new Set(
    [...content.matchAll(AC_TAG_PATTERN)]
      .map((m) => Number(m[1]))
      .filter(Number.isFinite)
      .map((n) => `AC-${n}`)
  );

  return {
    filePath,
    relativePath: path.relative(workspaceRoot, filePath).replace(/\\/g, "/"),
    mtimeMs: info.mtimeMs,
    content,
    describeBlocks,
    acIds,
    testTitles: []
  };
}

function relatedTests(featureName: string, snapshots: TestFileSnapshot[]): TestFileSnapshot[] {
  const normalized = normalizeName(featureName);
  const byFile = snapshots.filter((snapshot) => {
    const base = path.basename(snapshot.filePath).toLowerCase();
    const stripped = base.replace(/\.(spec|test|e2e)\.(ts|js)$/i, "");
    return normalizeName(stripped) === normalized;
  });
  if (byFile.length > 0) return byFile;

  return snapshots.filter((snapshot) =>
    snapshot.describeBlocks.some((title) => normalizeName(title).includes(normalized))
  );
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.story\.md$/i, "")
    .replace(/[-_]/g, "")
    .trim();
}

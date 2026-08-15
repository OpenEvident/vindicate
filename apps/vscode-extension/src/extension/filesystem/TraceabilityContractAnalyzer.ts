import { readFile } from "node:fs/promises";
import path from "node:path";
import type { StoryTraceWarning } from "../../shared/types";
import type { SpecFeatureAnalysis } from "./SpecAnalyzer";
import type { TestFileSnapshot } from "./TestFileIndex";
import { collectProjectTestFiles } from "./projectTestFiles.js";

const SPEC_HEADER = /^\s*\/\/\s*spec:\s*(.+)\s*$/im;
const SCENARIO_COMMENT = /^\s*\/\/\s*scenario:\s*(.+)\s*$/gim;
const TEST_TITLE = /\btest\s*\(\s*['"`]([^'"`]+)['"`]/gim;
const AC_TAG = /\[AC-(\d+)\]/gim;
const AC_TAG_LEADING = /^\[AC-\d+\]/;

export interface TraceabilityContractResult {
  explicitTraceability: Map<string, boolean>;
  testCountByFeature: Map<string, number>;
  warnings: StoryTraceWarning[];
}

export async function analyzeTraceabilityContract(
  workspaceRoot: string,
  features: SpecFeatureAnalysis[],
  snapshots?: TestFileSnapshot[]
): Promise<TraceabilityContractResult> {
  const featureBySlug = new Map(features.map((feature) => [feature.name, feature]));
  const explicitTraceability = new Map(features.map((feature) => [feature.name, false]));
  const testCountByFeature = new Map(features.map((feature) => [feature.name, 0]));
  const warnings: StoryTraceWarning[] = [];

  const testFiles = snapshots
    ? snapshots.map((snapshot) => ({
        filePath: snapshot.filePath,
        relFile: snapshot.relativePath,
        content: snapshot.content,
        testCount: snapshot.testTitles.length
      }))
    : await loadTestFileEntries(workspaceRoot);
  for (const file of testFiles) {
    const content = file.content;
    const relFile = file.relFile;
    const header = content.match(SPEC_HEADER)?.[1]?.trim() ?? null;
    const featureSlug = extractFeatureSlug(header);
    const feature = featureSlug ? (featureBySlug.get(featureSlug) ?? null) : null;

    if (!header) {
      warnings.push({
        kind: "missing-spec-header",
        severity: "warn",
        file: relFile,
        line: 1,
        feature: null,
        title: "Missing // spec header",
        detail: "Add `// spec: .vindicate/stories/<feature>.story.md` at the top of the test file."
      });
    } else if (!feature) {
      warnings.push({
        kind: "missing-spec-header",
        severity: "warn",
        file: relFile,
        line: 1,
        feature: featureSlug,
        title: "Spec link points to unknown story",
        detail: `Linked story '${header}' is not present in .vindicate/stories/.`
      });
    } else {
      explicitTraceability.set(feature.name, true);
      const currentCount = testCountByFeature.get(feature.name) ?? 0;
      testCountByFeature.set(feature.name, currentCount + file.testCount);
    }

    const scenarioCount = [...content.matchAll(SCENARIO_COMMENT)].length;
    const testMatches = [...content.matchAll(TEST_TITLE)];
    const testTitles = testMatches.map((match) => match[1] ?? "");
    const testCount = testTitles.length;
    if (testCount > 0 && scenarioCount < testCount) {
      warnings.push({
        kind: "missing-scenario-comment",
        severity: "warn",
        file: relFile,
        line: testMatches[0]?.index != null ? lineAt(content, testMatches[0].index) : 1,
        feature: feature?.name ?? featureSlug,
        title: "Missing // scenario comments",
        detail: `Found ${testCount} tests but only ${scenarioCount} scenario comments.`
      });
    }

    // Extract AC tags from test titles ONLY — comments or prose must not count as coverage
    const allAcTags = testTitles
      .flatMap((title) => [...title.matchAll(/\[AC-(\d+)\]/gi)])
      .map((m) => Number(m[1]))
      .filter(Number.isFinite)
      .map((n) => `AC-${n}`);

    // Skip deprecated stories for hard-failure checks — only warn
    const isDeprecated = feature?.storyStatus === "deprecated";

    // Missing AC tag entirely
    const testsWithoutAc = testTitles.filter((title) => !/\[AC-\d+\]/i.test(title)).length;
    if (testCount > 0 && testsWithoutAc > 0) {
      const firstMissing = testMatches.find((match) => !/\[AC-\d+\]/i.test(match[1] ?? ""));
      warnings.push({
        kind: "missing-ac-tag",
        severity: "warn",
        file: relFile,
        line: firstMissing?.index != null ? lineAt(content, firstMissing.index) : 1,
        feature: feature?.name ?? featureSlug,
        title: "Missing [AC-x] tags",
        detail: `${testsWithoutAc} of ${testCount} tests are missing [AC-x] tags in their title.`
      });
    }

    // AC tag not at start of title
    const testsWithTagNotFirst = testTitles.filter(
      (title) => /\[AC-\d+\]/i.test(title) && !AC_TAG_LEADING.test(title)
    ).length;
    if (testCount > 0 && testsWithTagNotFirst > 0) {
      const firstWrong = testMatches.find(
        (m) => /\[AC-\d+\]/i.test(m[1] ?? "") && !AC_TAG_LEADING.test(m[1] ?? "")
      );
      warnings.push({
        kind: "ac-tag-not-first",
        severity: "warn",
        file: relFile,
        line: firstWrong?.index != null ? lineAt(content, firstWrong.index) : 1,
        feature: feature?.name ?? featureSlug,
        title: "[AC-x] tag not at start of title",
        detail: `${testsWithTagNotFirst} test(s) have [AC-x] not as the first token. Move tag to the start: '[AC-1] should ...'`
      });
    }

    // Multiple AC tags on one test
    const testsWithMultiAc = testTitles.filter(
      (title) => (title.match(/\[AC-\d+\]/gi) ?? []).length > 1
    ).length;
    if (testCount > 0 && testsWithMultiAc > 0) {
      const firstMulti = testMatches.find(
        (m) => ((m[1] ?? "").match(/\[AC-\d+\]/gi)?.length ?? 0) > 1
      );
      warnings.push({
        kind: "multi-ac-tag",
        severity: "warn",
        file: relFile,
        line: firstMulti?.index != null ? lineAt(content, firstMulti.index) : 1,
        feature: feature?.name ?? featureSlug,
        title: "Multiple [AC-x] tags on one test",
        detail: `${testsWithMultiAc} test(s) have more than one [AC-x] tag. One scenario = one AC.`
      });
    }

    if (feature && !isDeprecated) {
      const allowed = new Set(feature.acIds);
      const storyScenarioNames = new Set(Object.keys(feature.scenarioAcMap));

      // Test count must match story AC count — story is source of truth
      if (testCount > 0 && testCount !== feature.acIds.length) {
        warnings.push({
          kind: "spec-story-count-mismatch",
          severity: "warn",
          file: relFile,
          line: null,
          feature: feature.name,
          title: "Spec test count differs from story AC count",
          detail: `Spec has ${testCount} test(s) but story lists ${feature.acIds.length} AC(s). Update the story (AC-n, ## [AC-n] testcases, [FA-x-y] bullets) or align the spec — counts must match 1:1.`
        });
      }

      // Scenario comments must match story testcase headings
      const scenarioComments = [...content.matchAll(SCENARIO_COMMENT)].map((m) =>
        (m[1] ?? "").trim()
      );
      for (const scenarioName of scenarioComments) {
        if (scenarioName.length > 0 && !storyScenarioNames.has(scenarioName)) {
          warnings.push({
            kind: "scenario-name-mismatch",
            severity: "warn",
            file: relFile,
            line: lineAt(content, content.indexOf(`scenario: ${scenarioName}`)),
            feature: feature.name,
            title: "Scenario comment not in story",
            detail: `// scenario: ${scenarioName} has no matching ## ${scenarioName} [AC-n] heading in the story. Rename the comment or update the story testcase heading.`
          });
        }
      }

      const unknown = [...new Set(allAcTags.filter((tag) => !allowed.has(tag)))];

      // Spec references ACs/tests not in story — story must be updated or spec reverted
      if (unknown.length > 0 || testCount > feature.acIds.length) {
        warnings.push({
          kind: "story-needs-update",
          severity: "warn",
          file: relFile,
          line: null,
          feature: feature.name,
          title: "Story out of sync with spec",
          detail:
            unknown.length > 0
              ? `Spec references AC tag(s) not in the story (${unknown.join(", ")}). Update Acceptance Criteria, testcases, and Feature [FA-x-y] bullets in the story, or revert the spec change.`
              : `Spec has more tests than story ACs. Add matching AC-n lines and ## [AC-n] testcases to the story, or remove extra tests from the spec.`
        });
      }

      // Orphaned tags — test references AC not in story
      if (unknown.length > 0) {
        const firstUnknown = findFirstUnknownAcIndex(content, allowed);
        warnings.push({
          kind: "unknown-ac-tag",
          severity: "warn",
          file: relFile,
          line: firstUnknown != null ? lineAt(content, firstUnknown) : null,
          feature: feature.name,
          title: "Unknown [AC-x] tags",
          detail: `These tags are not in the story: ${unknown.join(", ")}`
        });
      }

      // Missing coverage — AC in story with no tagged test
      const taggedInTests = new Set(allAcTags);
      const uncovered = [...allowed].filter((id) => !taggedInTests.has(id));
      if (uncovered.length > 0) {
        warnings.push({
          kind: "missing-ac-coverage",
          severity: "warn",
          file: relFile,
          line: null,
          feature: feature.name,
          title: "AC IDs with no test coverage",
          detail: `No test is tagged for: ${uncovered.join(", ")}`
        });
      }
    }
  }

  return { explicitTraceability, testCountByFeature, warnings };
}

async function loadTestFileEntries(
  workspaceRoot: string
): Promise<Array<{ filePath: string; relFile: string; content: string; testCount: number }>> {
  const testFiles = await collectProjectTestFiles(workspaceRoot);
  const entries: Array<{ filePath: string; relFile: string; content: string; testCount: number }> =
    [];

  for (const filePath of testFiles) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    entries.push({
      filePath,
      relFile: toRel(workspaceRoot, filePath),
      content,
      testCount: testCountForFile(content)
    });
  }

  return entries;
}

function extractFeatureSlug(specHeaderPath: string | null): string | null {
  if (!specHeaderPath) return null;
  const normalized = specHeaderPath.replace(/\\/g, "/").trim();
  const base = path.basename(normalized);
  if (!base.endsWith(".story.md")) return null;
  return base.replace(/\.story\.md$/i, "");
}

function toRel(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function findFirstUnknownAcIndex(content: string, allowed: Set<string>): number | null {
  for (const match of content.matchAll(AC_TAG)) {
    const ac = Number(match[1]);
    if (!Number.isFinite(ac)) continue;
    const tag = `AC-${ac}`;
    if (!allowed.has(tag)) return match.index ?? null;
  }
  return null;
}

function testCountForFile(content: string): number {
  return [...content.matchAll(TEST_TITLE)].length;
}

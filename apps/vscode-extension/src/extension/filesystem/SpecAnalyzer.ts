import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface SpecHeadingMap {
  feature: boolean;
  persona: boolean;
  acceptanceCriteria: boolean;
  testcases: boolean;
  outOfScope: boolean;
}

export interface SpecFeatureAnalysis {
  name: string;
  status: "complete" | "partial" | "missing";
  storyStatus: "draft" | "approved" | "deprecated" | "unknown";
  ac: number;
  acIds: string[];
  /** Maps scenario name (heading text without [AC-x]) → AC ID, e.g. "Happy Path" → "AC-1" */
  scenarioAcMap: Record<string, string>;
  headings: SpecHeadingMap;
  specFile: string;
  specMtimeMs: number;
  words: number;
}

export interface SpecAnalysis {
  total: number;
  complete: number;
  partial: number;
  missing: number;
  features: SpecFeatureAnalysis[];
}

export interface ISpecAnalyzer {
  analyzeAll(featuresDir: string): Promise<SpecAnalysis>;
}

const REQUIRED_SECTIONS = {
  feature: ["feature"],
  persona: ["persona"],
  acceptanceCriteria: ["acceptance", "criteria"],
  testcases: ["testcase", "test case", "testcases", "scenario", "scenarios"],
  outOfScope: ["out of scope", "out-of-scope", "non-goals", "non goals"]
} as const;

const PERSONA_BLOCK_RE = /\*\*Persona\*\*/i;
const TESTCASE_HEADING_RE = /^##\s+.+\[AC-\d+\]/im;

export class SpecAnalyzer implements ISpecAnalyzer {
  async analyzeAll(featuresDir: string): Promise<SpecAnalysis> {
    let entries: string[];
    try {
      entries = await readdir(featuresDir);
    } catch {
      return { total: 0, complete: 0, partial: 0, missing: 0, features: [] };
    }

    const mdFiles = entries.filter((f) => f.endsWith(".story.md"));
    const features: SpecAnalysis["features"] = [];

    for (const file of mdFiles) {
      const filePath = path.join(featuresDir, file);
      const content = await readFile(filePath, "utf8");
      const fileStat = await stat(filePath);
      const details = analyzeSpecContent(content);
      features.push({
        name: path.basename(file, ".story.md"),
        status: classifyStatus(details.headings),
        storyStatus: details.storyStatus,
        ac: details.ac,
        acIds: details.acIds,
        scenarioAcMap: details.scenarioAcMap,
        headings: details.headings,
        specFile: filePath,
        specMtimeMs: fileStat.mtimeMs,
        words: details.words
      });
    }

    const complete = features.filter((f) => f.status === "complete").length;
    const partial = features.filter((f) => f.status === "partial").length;
    const missing = features.filter((f) => f.status === "missing").length;

    return {
      total: features.length,
      complete,
      partial,
      missing,
      features
    };
  }
}

const FRONTMATTER_STATUS_RE = /^status:\s*(\S+)/im;
const SCENARIO_HEADING_RE = /^##\s+(.+?)\s*(?:\[AC-(\d+)\])?\s*$/gim;

function analyzeSpecContent(content: string): {
  headings: SpecHeadingMap;
  ac: number;
  acIds: string[];
  scenarioAcMap: Record<string, string>;
  storyStatus: "draft" | "approved" | "deprecated" | "unknown";
  words: number;
} {
  const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gim)].map((m) =>
    (m[1] ?? "").toLowerCase()
  );
  const matches = {
    feature: sectionMatch(headings, REQUIRED_SECTIONS.feature),
    persona: PERSONA_BLOCK_RE.test(content) || sectionMatch(headings, REQUIRED_SECTIONS.persona),
    acceptanceCriteria: sectionMatch(headings, REQUIRED_SECTIONS.acceptanceCriteria),
    testcases:
      TESTCASE_HEADING_RE.test(content) || sectionMatch(headings, REQUIRED_SECTIONS.testcases),
    outOfScope: sectionMatch(headings, REQUIRED_SECTIONS.outOfScope)
  };

  // AC IDs from Acceptance Criteria section (AC-n: format)
  const acMatches = [...content.matchAll(/\bAC-(\d+):/gim)].map((m) => Number(m[1]));
  const acIds = [...new Set(acMatches.filter(Number.isFinite).map((n) => `AC-${n}`))];
  const ac = acIds.length;

  // Scenario → AC map from headings: ## Scenario Name [AC-n]
  const scenarioAcMap: Record<string, string> = {};
  for (const match of content.matchAll(SCENARIO_HEADING_RE)) {
    const scenarioName = (match[1] ?? "").trim();
    const acNum = match[2];
    if (scenarioName && acNum) {
      scenarioAcMap[scenarioName] = `AC-${acNum}`;
    }
  }

  // Story lifecycle status from frontmatter
  const statusMatch = FRONTMATTER_STATUS_RE.exec(content);
  const rawStatus = statusMatch?.[1]?.toLowerCase() ?? "unknown";
  const storyStatus =
    rawStatus === "draft" || rawStatus === "approved" || rawStatus === "deprecated"
      ? rawStatus
      : "unknown";

  const words = content.split(/\s+/).filter(Boolean).length;

  return { headings: matches, ac, acIds, scenarioAcMap, storyStatus, words };
}

function classifyStatus(headings: SpecHeadingMap): "complete" | "partial" | "missing" {
  const matchedGroups = Object.values(headings).filter(Boolean).length;
  if (matchedGroups === 5) return "complete";
  if (matchedGroups >= 1) return "partial";
  return "missing";
}

function sectionMatch(headings: string[], keywords: readonly string[]): boolean {
  return headings.some((heading) => keywords.some((keyword) => heading.includes(keyword)));
}

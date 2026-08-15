import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateAcceptanceCoverage } from "../../../src/extension/filesystem/AcceptanceCoverageAnalyzer";
import type { SpecFeatureAnalysis } from "../../../src/extension/filesystem/SpecAnalyzer";

describe("AcceptanceCoverageAnalyzer", () => {
  const root = path.join(process.cwd(), "tests", "tmp-ac-coverage");
  const specsDir = path.join(root, ".vindicate", "stories");
  const testsDir = path.join(root, "tests");

  beforeEach(async () => {
    await mkdir(specsDir, { recursive: true });
    await mkdir(testsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("computes covered, missing, and drift from explicit AC tags", async () => {
    const authSpecPath = path.join(specsDir, "auth.story.md");
    const checkoutSpecPath = path.join(specsDir, "checkout.story.md");

    await writeFile(
      authSpecPath,
      "# Acceptance Criteria\n- AC-1: a\n- AC-2: b\n- AC-3: c\n",
      "utf8"
    );
    await writeFile(checkoutSpecPath, "# Acceptance Criteria\n- AC-1: a\n- AC-2: b\n", "utf8");

    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      "describe('auth', () => { test('[AC-1] ok', () => {}); test('[AC-2] ok', () => {}); })",
      "utf8"
    );
    await writeFile(
      path.join(testsDir, "checkout.spec.ts"),
      "describe('checkout', () => { test('[AC-1] ok', () => {}); test('[AC-9] stale', () => {}); })",
      "utf8"
    );

    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 3,
        acIds: ["AC-1", "AC-2", "AC-3"],
        scenarioAcMap: {},
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: authSpecPath,
        specMtimeMs: 0,
        words: 10
      },
      {
        name: "checkout",
        status: "complete",
        storyStatus: "approved",
        ac: 2,
        acIds: ["AC-1", "AC-2"],
        scenarioAcMap: {},
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: checkoutSpecPath,
        specMtimeMs: 0,
        words: 10
      }
    ];

    const coverage = await calculateAcceptanceCoverage(root, features);
    expect(coverage.total).toBe(5);
    expect(coverage.covered).toBe(3);
    expect(coverage.missing).toBe(2);
    expect(coverage.drift).toBe(1);
  });

  it("excludes deprecated stories from all coverage counters", async () => {
    const specPath = path.join(specsDir, "legacy.story.md");
    await writeFile(specPath, "# Acceptance Criteria\n- AC-1: old\n- AC-2: old\n", "utf8");
    await writeFile(
      path.join(testsDir, "legacy.spec.ts"),
      "test('[AC-1] old test', () => {});",
      "utf8"
    );

    const features: SpecFeatureAnalysis[] = [
      {
        name: "legacy",
        status: "complete",
        storyStatus: "deprecated",
        ac: 2,
        acIds: ["AC-1", "AC-2"],
        scenarioAcMap: {},
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: specPath,
        specMtimeMs: 0,
        words: 5
      }
    ];

    const coverage = await calculateAcceptanceCoverage(root, features);
    expect(coverage.total).toBe(0);
    expect(coverage.covered).toBe(0);
    expect(coverage.missing).toBe(0);
  });
});

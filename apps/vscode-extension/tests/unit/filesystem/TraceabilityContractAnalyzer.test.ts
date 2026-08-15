import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeTraceabilityContract } from "../../../src/extension/filesystem/TraceabilityContractAnalyzer";
import type { SpecFeatureAnalysis } from "../../../src/extension/filesystem/SpecAnalyzer";

describe("TraceabilityContractAnalyzer", () => {
  const root = path.join(process.cwd(), "tests", "tmp-trace-contract");
  const testsDir = path.join(root, "tests");

  beforeEach(async () => {
    await mkdir(testsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("warns when spec test count differs from story AC count", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Happy Path
test("[AC-1] should allow login", async () => {});
// scenario: Extra
test("[AC-2] extra test", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 1,
        acIds: ["AC-1"],
        scenarioAcMap: { "Happy Path": "AC-1" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    expect(result.warnings.some((w) => w.kind === "spec-story-count-mismatch")).toBe(true);
    expect(result.warnings.some((w) => w.kind === "story-needs-update")).toBe(true);
  });

  it("warns when scenario comment does not match story testcase heading", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Wrong Name
test("[AC-1] should allow login", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 1,
        acIds: ["AC-1"],
        scenarioAcMap: { "Happy Path": "AC-1" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    expect(result.warnings.some((w) => w.kind === "scenario-name-mismatch")).toBe(true);
  });

  it("warns when AC tag is at end of title instead of start", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Happy Path
test("should allow login [AC-1]", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 1,
        acIds: ["AC-1"],
        scenarioAcMap: { "Happy Path": "AC-1" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    expect(result.warnings.some((w) => w.kind === "ac-tag-not-first")).toBe(true);
  });

  it("warns when a test has multiple AC tags", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Happy Path
test("[AC-1][AC-2] should allow login", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 2,
        acIds: ["AC-1", "AC-2"],
        scenarioAcMap: { "Happy Path": "AC-1" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    expect(result.warnings.some((w) => w.kind === "multi-ac-tag")).toBe(true);
  });

  it("warns when an AC in the story has no tagged test", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Happy Path
test("[AC-1] should allow login", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 2,
        acIds: ["AC-1", "AC-2"],
        scenarioAcMap: { "Happy Path": "AC-1", "Edge Case: invalid": "AC-2" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    const coverageWarn = result.warnings.find((w) => w.kind === "missing-ac-coverage");
    expect(coverageWarn).toBeDefined();
    expect(coverageWarn?.detail).toContain("AC-2");
  });

  it("skips deprecated stories for orphan and coverage checks", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
test("[AC-99] stale tag", async () => {});
`,
      "utf8"
    );
    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "deprecated",
        ac: 1,
        acIds: ["AC-1"],
        scenarioAcMap: {},
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];
    const result = await analyzeTraceabilityContract(root, features);
    expect(result.warnings.some((w) => w.kind === "unknown-ac-tag")).toBe(false);
    expect(result.warnings.some((w) => w.kind === "missing-ac-coverage")).toBe(false);
  });

  it("builds explicit traceability and emits warnings for missing metadata", async () => {
    await writeFile(
      path.join(testsDir, "auth.spec.ts"),
      `// spec: .vindicate/stories/auth.story.md
import { test } from "@playwright/test";
// scenario: Happy Path
test("[AC-1] signs in", async () => {});
test("missing ac tag", async () => {});
`,
      "utf8"
    );
    await writeFile(
      path.join(testsDir, "search.spec.ts"),
      `import { test } from "@playwright/test";
test("search works", async () => {});
`,
      "utf8"
    );

    const features: SpecFeatureAnalysis[] = [
      {
        name: "auth",
        status: "complete",
        storyStatus: "approved",
        ac: 2,
        acIds: ["AC-1", "AC-2"],
        scenarioAcMap: { "Happy Path": "AC-1" },
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/auth.story.md",
        specMtimeMs: Date.now(),
        words: 12
      },
      {
        name: "search",
        status: "complete",
        storyStatus: "approved",
        ac: 1,
        acIds: ["AC-1"],
        scenarioAcMap: {},
        headings: {
          feature: true,
          persona: true,
          acceptanceCriteria: true,
          testcases: true,
          outOfScope: true
        },
        specFile: ".vindicate/stories/search.story.md",
        specMtimeMs: Date.now(),
        words: 10
      }
    ];

    const result = await analyzeTraceabilityContract(root, features);
    expect(result.explicitTraceability.get("auth")).toBe(true);
    expect(result.explicitTraceability.get("search")).toBe(false);
    expect(result.warnings.some((w) => w.kind === "missing-spec-header")).toBe(true);
    expect(result.warnings.some((w) => w.kind === "missing-scenario-comment")).toBe(true);
    expect(result.warnings.some((w) => w.kind === "missing-ac-tag")).toBe(true);
  });
});

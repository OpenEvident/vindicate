import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpecAnalyzer } from "../../../src/extension/filesystem/SpecAnalyzer";

describe("SpecAnalyzer", () => {
  const root = path.join(process.cwd(), "tests", "tmp-spec-analyzer");
  const featuresDir = path.join(root, ".vindicate", "stories");
  const analyzer = new SpecAnalyzer();

  beforeEach(async () => {
    await mkdir(featuresDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns zeros for empty features directory", async () => {
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result).toEqual({ total: 0, complete: 0, partial: 0, missing: 0, features: [] });
  });

  it("marks file with all five keyword groups as complete", async () => {
    await writeFile(
      path.join(featuresDir, "auth.story.md"),
      `# Authentication\n**Persona**\nusers.admin\n## Feature\n## Acceptance criteria\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.complete).toBe(1);
    expect(result.features[0]?.status).toBe("complete");
    expect(result.features[0]?.name).toBe("auth");
  });

  it("marks file with two keyword groups as partial", async () => {
    await writeFile(
      path.join(featuresDir, "pay.story.md"),
      `# Payments\n**Persona**\nusers.admin\n## Feature\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.partial).toBe(1);
    expect(result.features[0]?.status).toBe("partial");
  });

  it("marks file with no keyword groups as missing", async () => {
    await writeFile(path.join(featuresDir, "empty.story.md"), `# Title only\n`, "utf8");
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.missing).toBe(1);
  });

  it("ignores plain .md files that are not .story.md", async () => {
    await writeFile(
      path.join(featuresDir, "readme.md"),
      `## Description\n## User story\n## Acceptance criteria\n## Edge case\n`,
      "utf8"
    );
    await writeFile(
      path.join(featuresDir, "login.story.md"),
      `**Persona**\nusers.admin\n## Feature\n## Acceptance criteria\n## Sign In [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.total).toBe(1);
    expect(result.features[0]?.name).toBe("login");
  });

  it("aggregates mixed directory counts", async () => {
    await writeFile(
      path.join(featuresDir, "a.story.md"),
      `**Persona**\nusers.admin\n## Feature\n## Acceptance\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    await writeFile(path.join(featuresDir, "b.story.md"), `**Persona**\nusers.admin\n## Feature\n`, "utf8");
    await writeFile(path.join(featuresDir, "c.story.md"), `# No sections\n`, "utf8");
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.total).toBe(3);
    expect(result.complete).toBe(1);
    expect(result.partial).toBe(1);
    expect(result.missing).toBe(1);
  });

  it("extracts AC IDs from testcase headings into scenarioAcMap", async () => {
    await writeFile(
      path.join(featuresDir, "auth.story.md"),
      `---\nfeature: auth\nstatus: approved\n---\n**Persona**\nusers.admin\n## Feature\n## Acceptance criteria\nAC-1: login works\nAC-2: invalid creds rejected\n## Happy Path [AC-1]\n## Edge Case: invalid credentials [AC-2]\n## Out of scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    const feature = result.features[0];
    expect(feature?.scenarioAcMap["Happy Path"]).toBe("AC-1");
    expect(feature?.scenarioAcMap["Edge Case: invalid credentials"]).toBe("AC-2");
  });

  it("detects testcases from ## [AC-n] headings without a Testcases wrapper", async () => {
    await writeFile(
      path.join(featuresDir, "deliveroo.story.md"),
      `**Persona**\nusers.admin\n# Feature\n# Acceptance Criteria\nAC-1: first\n## Sign In [AC-1]\nGiven context\n# Out of Scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.features[0]?.headings.testcases).toBe(true);
  });

  it("reads story status from frontmatter", async () => {
    await writeFile(
      path.join(featuresDir, "approved.story.md"),
      `---\nfeature: approved\nstatus: approved\n---\n**Persona**\nusers.admin\n## Feature\n## Acceptance\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    await writeFile(
      path.join(featuresDir, "draft.story.md"),
      `---\nfeature: draft\nstatus: draft\n---\n**Persona**\nusers.admin\n## Feature\n## Acceptance\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    await writeFile(
      path.join(featuresDir, "deprecated.story.md"),
      `---\nfeature: deprecated\nstatus: deprecated\n---\n**Persona**\nusers.admin\n## Feature\n## Acceptance\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.features.find((f) => f.name === "approved")?.storyStatus).toBe("approved");
    expect(result.features.find((f) => f.name === "draft")?.storyStatus).toBe("draft");
    expect(result.features.find((f) => f.name === "deprecated")?.storyStatus).toBe("deprecated");
  });

  it("matches keywords case-insensitively", async () => {
    await writeFile(
      path.join(featuresDir, "case.story.md"),
      `**PERSONA**\nusers.admin\n## FEATURE\n## ACCEPTANCE CRITERIA\n## Happy Path [AC-1]\n## OUT OF SCOPE\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.complete).toBe(1);
  });

  it("recognizes legacy Scenarios heading as testcases", async () => {
    await writeFile(
      path.join(featuresDir, "legacy.story.md"),
      `**Persona**\nusers.admin\n## Feature\n## Acceptance criteria\n## Scenarios\n## Happy Path [AC-1]\n## Out of scope\n`,
      "utf8"
    );
    const result = await analyzer.analyzeAll(featuresDir);
    expect(result.features[0]?.status).toBe("complete");
    expect(result.features[0]?.headings.testcases).toBe(true);
  });
});

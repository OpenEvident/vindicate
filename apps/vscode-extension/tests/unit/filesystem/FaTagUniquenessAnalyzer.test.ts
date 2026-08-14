import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeFaTagUniqueness } from "../../../src/extension/filesystem/FaTagUniquenessAnalyzer";

describe("FaTagUniquenessAnalyzer", () => {
  const root = path.join(process.cwd(), "tests", "tmp-fa-uniqueness");
  const storiesDir = path.join(root, ".vindicate", "stories");

  beforeEach(async () => {
    await mkdir(storiesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("warns when the same FA tag appears in multiple stories", async () => {
    await writeFile(
      path.join(storiesDir, "login.story.md"),
      `# Feature\n- [FA-01-4] Login\n`,
      "utf8"
    );
    await writeFile(
      path.join(storiesDir, "auth.story.md"),
      `# Feature\n- [FA-01-4] Auth\n`,
      "utf8"
    );

    const warnings = await analyzeFaTagUniqueness(storiesDir);
    expect(warnings.some((w) => w.kind === "duplicate-fa-tag")).toBe(true);
    expect(warnings[0]?.detail).toContain("FA-01-4");
  });

  it("returns no warnings when FA tags are unique", async () => {
    await writeFile(
      path.join(storiesDir, "login.story.md"),
      `# Feature\n- [FA-01-4] Login\n`,
      "utf8"
    );
    await writeFile(
      path.join(storiesDir, "smoke.story.md"),
      `# Feature\n- [FA-00-1] Smoke\n`,
      "utf8"
    );

    const warnings = await analyzeFaTagUniqueness(storiesDir);
    expect(warnings).toEqual([]);
  });
});

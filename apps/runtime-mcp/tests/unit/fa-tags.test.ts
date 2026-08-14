import { describe, expect, it } from "vitest";

import {
  extractFaTagsFromFeatureSection,
  findCrossStoryFaDuplicates,
  findDuplicateTags,
  isValidFaTagFormat
} from "../../src/story/fa-tags.js";

describe("fa-tags", () => {
  it("validates FA tag format", () => {
    expect(isValidFaTagFormat("FA-01-4")).toBe(true);
    expect(isValidFaTagFormat("FA-1-4")).toBe(true);
    expect(isValidFaTagFormat("FE-1")).toBe(false);
    expect(isValidFaTagFormat("FA-01")).toBe(false);
  });

  it("extracts FA tags from Feature section only", () => {
    const body = `# Feature

- [FA-01-4] Sign in
- [FA-01-5] Navigate

# Acceptance Criteria
AC-1: [FA-01-4] should not match here
`;
    expect(extractFaTagsFromFeatureSection(body)).toEqual(["FA-01-4", "FA-01-5"]);
  });

  it("finds duplicate tags within a list", () => {
    expect(findDuplicateTags(["FA-01-4", "FA-01-5", "FA-01-4"])).toEqual(["FA-01-4"]);
  });

  it("finds cross-story FA duplicates", () => {
    const stories = [
      {
        path: ".vindicate/stories/login.story.md",
        content: `# Feature\n- [FA-01-4] Login\n`
      },
      {
        path: ".vindicate/stories/auth.story.md",
        content: `# Feature\n- [FA-01-4] Also login\n`
      },
      {
        path: ".vindicate/stories/smoke.story.md",
        content: `# Feature\n- [FA-00-1] Smoke\n`
      }
    ];
    const duplicates = findCrossStoryFaDuplicates(stories);
    expect(duplicates).toEqual([
      { tag: "FA-01-4", files: [".vindicate/stories/login.story.md", ".vindicate/stories/auth.story.md"] }
    ]);
  });
});

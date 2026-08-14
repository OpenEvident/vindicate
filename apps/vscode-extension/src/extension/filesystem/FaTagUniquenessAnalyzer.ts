import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { StoryTraceWarning } from "../../shared/types";
import { findCrossStoryFaDuplicates } from "./faTags";

export async function analyzeFaTagUniqueness(storiesDir: string): Promise<StoryTraceWarning[]> {
  let entries: string[];
  try {
    entries = await readdir(storiesDir);
  } catch {
    return [];
  }

  const stories: Array<{ path: string; content: string }> = [];
  for (const file of entries.filter((name) => name.endsWith(".story.md"))) {
    const filePath = path.join(storiesDir, file);
    const relPath = `.vindicate/stories/${file}`;
    try {
      const content = await readFile(filePath, "utf8");
      stories.push({ path: relPath, content });
    } catch {
      continue;
    }
  }

  const warnings: StoryTraceWarning[] = [];
  for (const duplicate of findCrossStoryFaDuplicates(stories)) {
    warnings.push({
      kind: "duplicate-fa-tag",
      severity: "warn",
      file: duplicate.files[0] ?? "",
      line: null,
      feature: null,
      title: `Duplicate FA tag [${duplicate.tag}]`,
      detail: `[${duplicate.tag}] is used in multiple stories: ${duplicate.files.join(", ")}. FA tags must be unique across the project.`
    });
  }

  return warnings;
}

/**
 * @file Loads every other story file in the project, for cross-file FA-tag uniqueness checks.
 */
import type { ProjectFs } from "../fs/project-fs.js";

export async function loadOtherStories(
  projectFs: ProjectFs,
  filePath: string
): Promise<Array<{ path: string; content: string }>> {
  const stories: Array<{ path: string; content: string }> = [];
  try {
    const entries = await projectFs.list(".vindicate/stories");
    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name.endsWith(".story.md")) {
        continue;
      }
      const relPath = `.vindicate/stories/${entry.name}`;
      try {
        const content = await projectFs.read(relPath);
        stories.push({ path: relPath, content });
      } catch {
        continue;
      }
    }
  } catch {
    return stories;
  }
  return stories.filter((story) => story.path !== filePath.replace(/\\/g, "/"));
}

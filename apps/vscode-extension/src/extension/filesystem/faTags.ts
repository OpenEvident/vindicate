/**
 * @file FA tag parsing for vscode-extension story analysis.
 * Format: `[FA-{domain-id}-{sub-domain}]` e.g. `[FA-01-4]`.
 */

export const FA_TAG_PATTERN = /\[(FA-\d+-\d+)\]/g;
export const FA_TAG_SINGLE_PATTERN = /\[(FA-\d+-\d+)\]/;

export function extractFaTagsFromFeatureSection(body: string): string[] {
  const sectionLines = extractFeatureSectionLines(body);
  return sectionLines
    .map((line) => FA_TAG_SINGLE_PATTERN.exec(line)?.[1])
    .filter((tag): tag is string => tag !== undefined && tag.length > 0);
}

export function findCrossStoryFaDuplicates(
  stories: ReadonlyArray<{ readonly path: string; readonly content: string }>
): Array<{ tag: string; files: string[] }> {
  const byTag = new Map<string, Set<string>>();
  for (const story of stories) {
    for (const tag of extractFaTagsFromFeatureSection(story.content.replace(/^---[\s\S]*?---\n/, ""))) {
      const files = byTag.get(tag) ?? new Set<string>();
      files.add(story.path);
      byTag.set(tag, files);
    }
  }
  return [...byTag.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([tag, files]) => ({ tag, files: [...files] }));
}

function extractFeatureSectionLines(body: string): string[] {
  const lines = body.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (/^#\s+Feature\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#\s+/.test(line)) {
      break;
    }
    if (inSection && line.trim().length > 0) {
      sectionLines.push(line);
    }
  }

  return sectionLines;
}

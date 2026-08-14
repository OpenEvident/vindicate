/**
 * @file FA tag parsing and validation for `.vindicate/stories/*.story.md`.
 * Format: `[FA-{domain-id}-{sub-domain}]` e.g. `[FA-01-4]`, `[FA-01-5]`.
 */

export const FA_TAG_PATTERN = /\[(FA-\d+-\d+)\]/g;
export const FA_TAG_SINGLE_PATTERN = /\[(FA-\d+-\d+)\]/;
export const FA_TAG_FORMAT = /^FA-\d+-\d+$/;

export interface FaTagOccurrence {
  readonly tag: string;
  readonly file: string;
  readonly line: number;
}

export function isValidFaTagFormat(tag: string): boolean {
  return FA_TAG_FORMAT.test(tag);
}

export function extractAllFaTags(content: string): string[] {
  return [...content.matchAll(FA_TAG_PATTERN)].map((match) => match[1]!);
}

export function extractFaTagsFromFeatureSection(body: string): string[] {
  const section = extractFeatureSectionLines(body);
  return section.lines
    .map((line) => FA_TAG_SINGLE_PATTERN.exec(line)?.[1])
    .filter((tag): tag is string => tag !== undefined && tag.length > 0);
}

export function findDuplicateTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) {
      duplicates.add(tag);
    } else {
      seen.add(tag);
    }
  }
  return [...duplicates];
}

export function collectFaTagsAcrossStories(
  stories: ReadonlyArray<{ readonly path: string; readonly content: string }>
): FaTagOccurrence[] {
  const occurrences: FaTagOccurrence[] = [];
  for (const story of stories) {
    const lines = story.content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      for (const match of line.matchAll(FA_TAG_PATTERN)) {
        occurrences.push({ tag: match[1]!, file: story.path, line: i + 1 });
      }
    }
  }
  return occurrences;
}

export function findCrossStoryFaDuplicates(
  stories: ReadonlyArray<{ readonly path: string; readonly content: string }>
): Array<{ tag: string; files: string[] }> {
  const byTag = new Map<string, Set<string>>();
  for (const occurrence of collectFaTagsAcrossStories(stories)) {
    const files = byTag.get(occurrence.tag) ?? new Set<string>();
    files.add(occurrence.file);
    byTag.set(occurrence.tag, files);
  }
  return [...byTag.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([tag, files]) => ({ tag, files: [...files] }));
}

function extractFeatureSectionLines(body: string): { lines: string[] } {
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

  return { lines: sectionLines };
}

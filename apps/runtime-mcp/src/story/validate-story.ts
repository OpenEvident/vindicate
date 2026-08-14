/**
 * @file Story file structure validation for `.vindicate/stories/*.story.md`.
 */
import {
  extractFaTagsFromFeatureSection,
  findDuplicateTags,
  isValidFaTagFormat
} from "./fa-tags.js";

export interface StoryValidationError {
  readonly field: string;
  readonly message: string;
  readonly line?: number;
}

export interface StoryValidationResult {
  readonly valid: boolean;
  readonly errors: StoryValidationError[];
}

export interface StoryValidationContext {
  /** Absolute or project-relative path of the story being validated. */
  readonly filePath?: string;
  /** Other story files in the project for cross-file FA uniqueness checks. */
  readonly otherStories?: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

const VALID_STATUSES = new Set(["draft", "approved", "deprecated"]);
const AC_TAG_PATTERN = /\[(AC-\d+)\]/g;
const TESTCASE_HEADING = /^## .+ \[AC-\d+\]\s*$/;

export function validateStoryContent(
  content: string,
  context: StoryValidationContext = {}
): StoryValidationResult {
  const errors: StoryValidationError[] = [];
  const { frontmatter, body } = parseFrontmatter(content);

  for (const field of ["feature", "status", "version"] as const) {
    const value = frontmatter[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({
        field,
        message: `Frontmatter is missing required field '${field}'.`,
        line: 2
      });
    }
  }

  const status = frontmatter.status?.trim();
  if (status !== undefined && status.length > 0 && !VALID_STATUSES.has(status)) {
    const statusLine = frontmatterLineForKey(content, "status");
    errors.push({
      field: "status",
      message: `status must be one of: draft, approved, deprecated (got '${status}').`,
      ...(statusLine !== undefined ? { line: statusLine } : {})
    });
  }

  validateFeatureSection(body, status, errors);
  validateFaUniquenessAcrossProject(content, context, errors);

  const acceptanceCriteria = extractAcceptanceCriteria(body);
  const acIds = acceptanceCriteria.ids;
  if (acIds.length === 0) {
    errors.push({
      field: "acceptance_criteria",
      message: "Acceptance Criteria section must contain at least one AC-n item.",
      line: acceptanceCriteria.startLine
    });
  } else {
    validateSequentialAcIds(acIds, errors, acceptanceCriteria.startLine, "AC");
  }

  const faCount = extractFaTagsFromFeatureSection(body).length;
  if (faCount >= 3 && acIds.length === 1 && acIds[0] === "AC-1") {
    errors.push({
      field: "acceptance_criteria",
      message:
        "Only AC-1 exists but Feature lists 3+ [FA-x-y] items — split acceptance criteria by phase instead of collapsing the flow into a single AC.",
      line: acceptanceCriteria.startLine
    });
  }

  // [AC-n] testcase tagging is only enforced from "approved" onward — understand.md documents that a
  // draft story's testcases "may start un-numbered here", since design assigns the final sequential
  // [AC-n] set at approval (once the agreed scenario list is settled with the user).
  if (status !== "draft") {
    const testcaseTags = extractTestcaseTags(body);
    for (const testcase of testcaseTags) {
      if (!TESTCASE_HEADING.test(testcase.text)) {
        errors.push({
          field: "testcase",
          message: `Testcase heading must end with exactly one [AC-n] tag: '${testcase.text.trim()}'.`,
          line: testcase.line
        });
        continue;
      }
      const tags = [...testcase.text.matchAll(AC_TAG_PATTERN)].map((match) => match[1]!);
      if (tags.length !== 1) {
        errors.push({
          field: "testcase",
          message: `Testcase heading must include exactly one [AC-n] tag: '${testcase.text.trim()}'.`,
          line: testcase.line
        });
        continue;
      }
      const tag = tags[0]!;
      if (!acIds.includes(tag)) {
        errors.push({
          field: "testcase",
          message: `${tag} is referenced in a testcase heading but is not listed under Acceptance Criteria.`,
          line: testcase.line
        });
      }
    }

    const testcaseAcIds = testcaseTags
      .map((testcase) => [...testcase.text.matchAll(AC_TAG_PATTERN)].map((match) => match[1]!))
      .flat()
      .filter((tag) => tag.length > 0);

    for (const acId of acIds) {
      if (!testcaseAcIds.includes(acId)) {
        errors.push({
          field: "testcase",
          message: `${acId} is listed under Acceptance Criteria but has no matching ## … [${acId}] testcase.`,
          line: acceptanceCriteria.startLine
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateFaUniquenessAcrossProject(
  content: string,
  context: StoryValidationContext,
  errors: StoryValidationError[]
): void {
  if (!context.otherStories || context.otherStories.length === 0) {
    return;
  }

  const currentPath = context.filePath ?? "current";
  const localTags = extractFaTagsFromFeatureSection(parseFrontmatter(content).body);
  const allStories = [
    ...context.otherStories.filter((story) => story.path !== currentPath),
    { path: currentPath, content }
  ];

  const tagOwners = new Map<string, Set<string>>();
  for (const story of allStories) {
    for (const tag of extractFaTagsFromFeatureSection(parseFrontmatter(story.content).body)) {
      const owners = tagOwners.get(tag) ?? new Set<string>();
      owners.add(story.path);
      tagOwners.set(tag, owners);
    }
  }

  for (const tag of localTags) {
    const owners = tagOwners.get(tag);
    if (owners && owners.size > 1) {
      errors.push({
        field: "feature",
        message: `[${tag}] is already used in another story (${[...owners].filter((p) => p !== currentPath).join(", ")}). FA tags must be unique across the project.`,
        line: extractSection(parseFrontmatter(content).body, "Feature").startLine
      });
    }
  }
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    return { frontmatter: {}, body: content };
  }
  const raw = normalized.slice(4, end);
  const body = normalized.slice(end + 5);
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function validateFeatureSection(
  body: string,
  status: string | undefined,
  errors: StoryValidationError[]
): void {
  const section = extractSection(body, "Feature");
  if (section.lines.length === 0) {
    errors.push({
      field: "feature",
      message: "Story must include a # Feature section with at least one [FA-x-y] item.",
      line: section.startLine
    });
    return;
  }

  const faIds = extractFaTagsFromFeatureSection(body);

  if (faIds.length === 0) {
    errors.push({
      field: "feature",
      message:
        "Feature section must contain at least one [FA-{domain-id}-{sub-domain}] tag (e.g. [FA-01-4]).",
      line: section.startLine
    });
    return;
  }

  for (const tag of faIds) {
    if (!isValidFaTagFormat(tag)) {
      errors.push({
        field: "feature",
        message: `Invalid FA tag format '${tag}'. Use [FA-{domain-id}-{sub-domain}] (e.g. [FA-01-4]).`,
        line: section.startLine
      });
    }
  }

  for (const duplicate of findDuplicateTags(faIds)) {
    errors.push({
      field: "feature",
      message: `[${duplicate}] appears more than once in the Feature section. FA tags must be unique within the story.`,
      line: section.startLine
    });
  }

  if (status === "approved" && faIds.length === 0) {
    errors.push({
      field: "feature",
      message: "Approved stories require at least one [FA-x-y] tag in the Feature section.",
      line: section.startLine
    });
  }
}

function extractSection(
  body: string,
  title: string
): { lines: string[]; startLine: number } {
  const lines = body.split("\n");
  let inSection = false;
  let startLine = 0;
  const sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (new RegExp(`^#\\s+${escapeRegExp(title)}\\s*$`, "i").test(line)) {
      inSection = true;
      startLine = i + 1;
      continue;
    }
    if (inSection && /^#\s+/.test(line)) {
      break;
    }
    if (inSection && line.trim().length > 0) {
      sectionLines.push(line);
    }
  }

  return { lines: sectionLines, startLine };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAcceptanceCriteria(body: string): {
  ids: string[];
  startLine: number;
} {
  const section = extractSection(body, "Acceptance Criteria");
  const ids: string[] = [];
  for (const line of section.lines) {
    if (line.startsWith("## ")) {
      continue;
    }
    const match = /^\s*(?:- \[ \] )?AC-(\d+):/.exec(line);
    if (match !== null) {
      ids.push(`AC-${match[1]}`);
    }
  }
  return { ids, startLine: section.startLine };
}

function validateSequentialAcIds(
  ids: string[],
  errors: StoryValidationError[],
  startLine: number,
  prefix: "AC"
): void {
  const numbers = ids.map((id) => Number(id.replace(`${prefix}-`, "")));
  for (let i = 0; i < numbers.length; i += 1) {
    const expected = i + 1;
    if (numbers[i] !== expected) {
      errors.push({
        field: "acceptance_criteria",
        message: `Acceptance criteria must be numbered sequentially without gaps (expected ${prefix}-${expected}, found ${prefix}-${numbers[i]}).`,
        line: startLine + i
      });
      return;
    }
  }
}

function extractTestcaseTags(body: string): Array<{ text: string; line: number }> {
  const lines = body.split("\n");
  const testcases: Array<{ text: string; line: number }> = [];
  let collecting = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^#\s+Acceptance Criteria\s*$/i.test(line)) {
      collecting = true;
      continue;
    }
    if (/^#\s+(Testcases|Test cases|Scenarios)\s*$/i.test(line)) {
      collecting = true;
      continue;
    }
    if (/^#\s+(Out of Scope|Change Log)\s*$/i.test(line)) {
      collecting = false;
      continue;
    }
    if (collecting && line.startsWith("## ")) {
      testcases.push({ text: line, line: i + 1 });
    }
  }
  return testcases;
}

function frontmatterLineForKey(content: string, key: string): number | undefined {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startsWith(`${key}:`)) {
      return i + 1;
    }
  }
  return undefined;
}

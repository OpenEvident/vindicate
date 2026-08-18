/**
 * @file Story approval logic: builds the "approved" candidate of a story's content and validates
 * it, so approval and validation happen atomically instead of as two disconnected steps (an agent
 * hand-editing `status: approved` with no guarantee the story was ever validated in that shape).
 */
import {
  validateStoryContent,
  type StoryValidationContext,
  type StoryValidationError
} from "./validate-story.js";

const FRONTMATTER_DELIMITER = "---";

/**
 * Returns story content with the frontmatter `status:` value swapped to "approved". If the
 * frontmatter block or a status line can't be found, returns the content unchanged so
 * validateStoryContent()'s existing "missing required field 'status'" check catches it, rather
 * than this function silently producing something unexpected.
 */
export function buildApprovedCandidate(content: string): string {
  const lines = content.split(/\r\n|\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return content;
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === FRONTMATTER_DELIMITER) {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return content;
  }

  let statusIndex = -1;
  for (let i = 1; i < closingIndex; i += 1) {
    if (/^status\s*:/.test(lines[i] ?? "")) {
      statusIndex = i;
      break;
    }
  }
  if (statusIndex === -1) {
    return content;
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  lines[statusIndex] = "status: approved";
  return lines.join(newline);
}

export type ApprovalResult =
  | { readonly approved: true; readonly content: string }
  | { readonly approved: false; readonly errors: StoryValidationError[] };

/**
 * Pure decision: does this story's content, with status set to approved, pass validation? Never
 * touches the filesystem — the caller (the MCP tool) writes `content` back only when `approved`.
 */
export function evaluateApproval(
  content: string,
  context: StoryValidationContext = {}
): ApprovalResult {
  const candidate = buildApprovedCandidate(content);
  const result = validateStoryContent(candidate, context);
  if (!result.valid) {
    return { approved: false, errors: result.errors };
  }
  return { approved: true, content: candidate };
}

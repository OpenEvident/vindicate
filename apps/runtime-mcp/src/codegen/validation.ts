import type { ZodError, ZodIssue } from "zod";

import { CodegenValidationError } from "../shared/errors.js";
import { SUPPORTED_MATCHERS, VALID_ACTIONS } from "./schema.js";

export function flattenZodIssues(err: ZodError): ZodIssue[] {
  const flat: ZodIssue[] = [];
  for (const issue of err.issues) {
    if (issue.code === "invalid_union") {
      const unionErrors = (issue as ZodIssue & { unionErrors?: ZodError[] }).unionErrors;
      if (Array.isArray(unionErrors)) {
        for (const unionErr of unionErrors) {
          flat.push(...flattenZodIssues(unionErr));
        }
        continue;
      }
    }
    flat.push(issue);
  }
  return flat;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function suggest(input: string, validValues: readonly string[]): string | undefined {
  const prefixMatch = validValues.find(
    (v) =>
      v.toLowerCase().startsWith(input.toLowerCase()) ||
      input.toLowerCase().startsWith(v.toLowerCase())
  );
  if (prefixMatch !== undefined) {
    return prefixMatch;
  }

  const maxDist = Math.floor(input.length / 2);
  let bestMatch: string | undefined;
  let bestDist = Infinity;
  for (const v of validValues) {
    const d = levenshtein(input.toLowerCase(), v.toLowerCase());
    if (d < bestDist && d <= maxDist) {
      bestDist = d;
      bestMatch = v;
    }
  }
  return bestMatch;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function buildActionError(field: string, invalidAction: string): CodegenValidationError {
  const hint = suggest(invalidAction, VALID_ACTIONS);
  const validList = VALID_ACTIONS.join(", ");
  const fix =
    hint !== undefined
      ? `Did you mean '${hint}'? Valid actions: ${validList}`
      : `Valid actions: ${validList}`;
  return new CodegenValidationError(field, `Unknown action '${invalidAction}'`, fix);
}

export function buildMatcherError(field: string, invalidMatcher: string): CodegenValidationError {
  const hint = suggest(invalidMatcher, SUPPORTED_MATCHERS);
  const fix =
    hint !== undefined
      ? `Did you mean '${hint}'?`
      : `Valid matchers: ${SUPPORTED_MATCHERS.join(", ")}`;
  return new CodegenValidationError(field, `Unknown matcher '${invalidMatcher}'`, fix);
}

export function zodErrorToCodegenError(err: ZodError): CodegenValidationError {
  const issues = flattenZodIssues(err);
  const issue =
    issues.find((i) => i.path.join(".").endsWith(".do")) ??
    issues.find((i) => i.path.join(".").endsWith(".matcher")) ??
    issues[0];
  if (issue === undefined) {
    return new CodegenValidationError(
      "input",
      "Schema validation failed",
      "Check the vindicate_generate_code tool description and codegen-lab scenario fixtures for valid schema shape."
    );
  }

  const field = issue.path.join(".");
  const message = issue.message;

  if (field.endsWith(".do") && message.toLowerCase().includes("invalid discriminator")) {
    return new CodegenValidationError(field, message, `Valid actions: ${VALID_ACTIONS.join(", ")}`);
  }
  if (field.endsWith(".matcher") && message.toLowerCase().includes("invalid option")) {
    return new CodegenValidationError(
      field,
      message,
      `Valid matchers: ${SUPPORTED_MATCHERS.join(", ")}`
    );
  }

  const received = "received" in issue ? formatUnknown(issue.received) : "";
  if (received.length > 0) {
    if (field.endsWith(".do")) {
      return buildActionError(field, received);
    }
    if (field.endsWith(".matcher")) {
      return buildMatcherError(field, received);
    }
  }

  return new CodegenValidationError(
    field || "input",
    message,
    `Fix the value at '${field || "input"}' — ${message.toLowerCase()}`
  );
}

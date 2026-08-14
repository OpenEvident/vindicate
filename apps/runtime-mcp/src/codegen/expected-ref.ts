import type { PageDef } from "./schema.js";

const EXPECTED_MEMBER_PATTERN = /\bexpected\.([a-zA-Z_$][\w$]*)/g;

export function hasExpectedData(
  expected: Record<string, unknown> | undefined
): expected is Record<string, unknown> {
  return expected !== undefined && Object.keys(expected).length > 0;
}

export function expectedKeysInExpression(expression: string): string[] {
  const keys: string[] = [];
  for (const match of expression.matchAll(EXPECTED_MEMBER_PATTERN)) {
    keys.push(match[1]!);
  }
  return keys;
}

export function pageAssertionUsesExpected(page: PageDef): boolean {
  for (const verify of page.verifies) {
    for (const assertion of verify.assertions) {
      if (assertion.arg !== undefined && expectedKeysInExpression(assertion.arg).length > 0) {
        return true;
      }
    }
  }
  return false;
}

export function featureExpectedBarrelExport(feature: string): string {
  const featureCamel = feature.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
  return `${featureCamel}Expected`;
}

/** Keys in `expected` whose string value equals `value` (exact match). */
export function expectedKeysForStringValue(
  expectedData: Record<string, unknown>,
  value: string
): string[] {
  const keys: string[] = [];
  for (const [key, entry] of Object.entries(expectedData)) {
    if (typeof entry === "string" && entry === value) {
      keys.push(key);
    }
  }
  return keys;
}

/** Duplicate string values across top-level `expected` keys (values → keys). */
export function duplicateExpectedStringValues(
  expectedData: Record<string, unknown>
): Map<string, string[]> {
  const byValue = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(expectedData)) {
    if (typeof entry !== "string") {
      continue;
    }
    const keys = byValue.get(entry) ?? [];
    keys.push(key);
    byValue.set(entry, keys);
  }
  const duplicates = new Map<string, string[]>();
  for (const [value, keys] of byValue) {
    if (keys.length > 1) {
      duplicates.set(value, keys);
    }
  }
  return duplicates;
}

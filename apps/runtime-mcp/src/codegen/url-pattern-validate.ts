import type { ValidationError } from "./validation-errors.js";
import { validationError } from "./validation-errors.js";

const TS_SINGLE_QUOTED_STRING = /^'([^'\\]|\\.)*'$/;
const TS_DOUBLE_QUOTED_STRING = /^"([^"\\]|\\.)*"$/;
const TS_REGEX_LITERAL = /^\/(\\.|[^/])+\/[gimsuy]*$/;
const EXPECTED_REF = /^expected\.[A-Za-z0-9_]+$/;

function unquoteTsString(literal: string): string {
  const body = literal.slice(1, -1);
  if (literal.startsWith("'")) {
    return body.replace(/\\'/g, "'");
  }
  return body.replace(/\\"/g, '"');
}

export type UrlPatternArgKind = "string" | "regex" | "expression";

/** Classify a toHaveURL assertion `arg` TS expression for URL-pattern validation. */
export function classifyUrlPatternAssertionArg(arg: string): UrlPatternArgKind {
  const trimmed = arg.trim();
  if (trimmed.length === 0) {
    return "expression";
  }
  if (TS_REGEX_LITERAL.test(trimmed)) {
    return "regex";
  }
  if (TS_SINGLE_QUOTED_STRING.test(trimmed) || TS_DOUBLE_QUOTED_STRING.test(trimmed)) {
    return "string";
  }
  if (EXPECTED_REF.test(trimmed)) {
    return "expression";
  }
  return "expression";
}

export function stringLiteralFromAssertionArg(arg: string): string | undefined {
  const trimmed = arg.trim();
  if (TS_SINGLE_QUOTED_STRING.test(trimmed) || TS_DOUBLE_QUOTED_STRING.test(trimmed)) {
    return unquoteTsString(trimmed);
  }
  return undefined;
}

// Playwright URL globs may end with an open-tail glob (path + "/**") but not "**" after a literal
// segment (e.g. "**/dashboard/index**" is invalid).
export function isMalformedPlaywrightUrlGlob(pattern: string): boolean {
  if (!pattern.includes("*")) {
    return false;
  }
  if (pattern.endsWith("**") && pattern.length > 2) {
    const charBeforeSuffix = pattern[pattern.length - 3];
    if (charBeforeSuffix !== "/") {
      return true;
    }
  }
  if (/^\*\*[^/*].*\*\*$/.test(pattern)) {
    return true;
  }
  return false;
}

export function tryDetectMalformedUrlPattern(
  pattern: string,
  path: string,
  context: string
): ValidationError | undefined {
  if (!isMalformedPlaywrightUrlGlob(pattern)) {
    return undefined;
  }
  return validationError(
    "malformed_url_glob",
    path,
    `${context}: URL pattern '${pattern}' is not a valid Playwright glob (trailing '**' after a path segment is invalid).`,
    'Use an exact path string ("\'/dashboard/index\'"), a regex ("/dashboard\\/index/"), or a valid glob prefix ("**/dashboard/index") — never wrap the path with \'**\' on both sides.',
    "'/web/index.php/dashboard/index' or /dashboard\\/index/"
  );
}

// Confirmed live (reproduced against a real scaffolded project, baseURL configured — the Vindicate
// default): `toHaveURL('**/checkout/')` does NOT do what its glob syntax implies. Playwright treats
// any string arg that doesn't start with a scheme as relative to `baseURL` and prefixes it — turning
// `'**/checkout/'` into the literal glob `'https://example.com/**/checkout/'`, which then fails to
// match the real URL `'https://example.com/checkout/'` (the `**` no longer means "any prefix", it's
// now stuck after a fixed origin it must still satisfy). A plain relative string with no wildcard
// ('/checkout/') is unaffected — baseURL-prefixing is exactly the intended, correct use there — this
// only fires for the wildcard+relative combination.
function isBaseUrlUnsafeGlob(pattern: string): boolean {
  if (pattern.startsWith("http://") || pattern.startsWith("https://")) {
    return false;
  }
  return pattern.includes("*") || pattern.includes("?");
}

export function tryDetectBaseUrlUnsafeGlob(
  pattern: string,
  path: string,
  context: string
): ValidationError | undefined {
  if (!isBaseUrlUnsafeGlob(pattern)) {
    return undefined;
  }
  return validationError(
    "baseurl_unsafe_url_glob",
    path,
    `${context}: URL pattern '${pattern}' mixes a wildcard with a relative (non-http/https) path — Playwright resolves a relative toHaveURL string against the project's configured baseURL first, which breaks the wildcard's meaning (confirmed live: 'baseURL + **/checkout/' does not match the real URL).`,
    "Use a regex instead, which is never baseURL-resolved: e.g. /\\/checkout\\/?$/ for '**/checkout/'.",
    "/\\/checkout\\/confirmation\\/?$/"
  );
}

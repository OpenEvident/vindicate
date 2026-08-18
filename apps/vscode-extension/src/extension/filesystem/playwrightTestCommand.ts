import path from "node:path";
import type { TestSuiteOption } from "../../shared/types";
import { isProjectTestFile } from "./projectTestFiles.js";

export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function toPosixRelative(workspaceRoot: string, absolutePath: string): string {
  return toPosixPath(path.relative(workspaceRoot, absolutePath));
}

export function suiteLabelFromRelativePath(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? relativePath;
  return base.replace(/\.(spec|test|e2e)\.(ts|js)$/i, "");
}

export function toTestSuiteOptions(relativePaths: string[]): TestSuiteOption[] {
  const seen = new Set<string>();
  const options: TestSuiteOption[] = [];
  for (const raw of relativePaths) {
    const relativePath = toPosixPath(raw);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    options.push({
      relativePath,
      label: suiteLabelFromRelativePath(relativePath)
    });
  }
  options.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return options;
}

export function allowlistSuitePaths(
  requested: string[] | undefined,
  knownRelativePaths: string[]
): string[] {
  if (!requested || requested.length === 0) return [];
  const known = new Set(knownRelativePaths.map(toPosixPath));
  const allowed: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const posix = toPosixPath(raw).replace(/^\/+/, "");
    if (posix.includes("..")) continue;
    if (!posix.startsWith("tests/")) continue;
    if (!isProjectTestFile(posix)) continue;
    if (!known.has(posix) || seen.has(posix)) continue;
    seen.add(posix);
    allowed.push(posix);
  }
  return allowed;
}

export function quotePlaywrightArg(arg: string): string {
  if (!/[\s"'`$&|;<>()!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function buildPlaywrightTestCommand(
  suites: string[] | undefined,
  knownRelativePaths: string[]
): string {
  const allowed = allowlistSuitePaths(suites, knownRelativePaths);
  const known = knownRelativePaths.map(toPosixPath);
  const selectedAllKnown =
    known.length > 0 && allowed.length === known.length && known.every((p) => allowed.includes(p));
  if (allowed.length === 0 || selectedAllKnown) {
    return "npx playwright test";
  }
  return `npx playwright test ${allowed.map(quotePlaywrightArg).join(" ")}`;
}

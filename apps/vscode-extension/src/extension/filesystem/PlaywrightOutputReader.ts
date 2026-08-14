import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ILogger } from "../shared/logger";
import type { PlaywrightResults } from "./MetricsCalculator";

export interface IPlaywrightOutputReader {
  detectOutputPath(folderPath: string): Promise<string | null>;
  readResults(outputPath: string): Promise<PlaywrightResults | null>;
}

const FALLBACK_FILES = ["test-results.json", "results.json", "playwright-report/results.json"];

export class PlaywrightOutputReader implements IPlaywrightOutputReader {
  constructor(private readonly logger: ILogger) {}

  async detectOutputPath(folderPath: string): Promise<string | null> {
    const fromConfig = await detectFromConfig(folderPath);
    if (fromConfig && (await fileExists(fromConfig))) {
      return fromConfig;
    }

    for (const relative of FALLBACK_FILES) {
      const candidate = path.join(folderPath, relative);
      if (await fileExists(candidate)) return candidate;
    }

    return null;
  }

  async readResults(outputPath: string): Promise<PlaywrightResults | null> {
    if (!(await fileExists(outputPath))) {
      return null;
    }

    try {
      const raw = await readFile(outputPath, "utf8");
      const json = JSON.parse(raw) as PlaywrightReport;
      const stats = countResults(json);
      const fileStat = await stat(outputPath);
      return {
        passed: stats.passed,
        failed: stats.failed,
        skipped: stats.skipped,
        flaky: stats.flaky,
        total: stats.total,
        durationMs: stats.durationMs,
        lastRunAt: fileStat.mtime,
        perFeature: stats.perFeature,
        failures: stats.failures,
        slowestTests: stats.slowestTests
      };
    } catch (err) {
      if (isENOENT(err)) {
        return null;
      }
      this.logger.warn(`Could not read Playwright results: ${String(err)}`);
      return null;
    }
  }
}

interface PlaywrightReport {
  stats?: { duration?: number };
  suites?: PlaywrightSuite[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  specs?: Array<{
    title?: string;
    file?: string;
    tests?: Array<{
      title?: string;
      location?: { file?: string; line?: number };
      error?: { message?: string };
      results?: Array<{
        status?: string;
        duration?: number;
        error?: { message?: string; location?: { file?: string; line?: number } };
      }>;
    }>;
  }>;
  suites?: PlaywrightSuite[];
}

async function detectFromConfig(folderPath: string): Promise<string | null> {
  for (const name of ["playwright.config.ts", "playwright.config.js"]) {
    const configPath = path.join(folderPath, name);
    if (!(await fileExists(configPath))) continue;
    const content = await readFile(configPath, "utf8");
    const match = content.match(/outputFile:\s*['"`]([^'"`]+)['"`]/);
    if (match?.[1]) {
      return path.isAbsolute(match[1]) ? match[1] : path.join(folderPath, match[1]);
    }
  }
  return null;
}

function countResults(report: PlaywrightReport): {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  durationMs: number;
  perFeature: Map<string, { passed: number; failed: number; skipped: number; flaky: number; total: number }>;
  failures: Array<{
    id: string;
    feature: string;
    ac: string;
    title: string;
    file: string;
    message: string;
    duration: string;
    flaky: boolean;
  }>;
  slowestTests: Array<{ title: string; feature: string; duration: string }>;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaky = 0;
  const perFeature = new Map<string, { passed: number; failed: number; skipped: number; flaky: number; total: number }>();
  const failures: Array<{
    id: string;
    feature: string;
    ac: string;
    title: string;
    file: string;
    message: string;
    duration: string;
    flaky: boolean;
  }> = [];
  const slowestTests: Array<{ title: string; feature: string; duration: string; durationMs: number }> = [];

  const walk = (suites: PlaywrightSuite[] | undefined, parentFeature: string): void => {
    if (!suites) return;
    for (const suite of suites) {
      const suiteFeature = slugFromTitle(suite.title ?? suite.file ?? parentFeature);
      for (const spec of suite.specs ?? []) {
        const specFeature = slugFromTitle(spec.file ?? suite.file ?? suiteFeature);
        for (const test of spec.tests ?? []) {
          const key = specFeature || "general";
          const existing = perFeature.get(key) ?? { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 };
          const displayTitle = test.title ?? spec.title ?? "Unnamed test";
          const displayFile =
            formatFailureFile(test.location?.file, test.location?.line) ?? spec.file ?? suite.file ?? key;
          const ac = extractAcTag(displayTitle) ?? "AC-?";
          const hasRetryPass =
            (test.results ?? []).some((result) => result.status === "passed") &&
            (test.results ?? []).some((result) => result.status !== "passed");
          let slowestDurationMs = 0;
          if (hasRetryPass) {
            flaky += 1;
            existing.flaky += 1;
          }

          for (const result of test.results ?? []) {
            const status = result.status ?? "";
            const resultDurationMs = normalizeDurationMs(result.duration);
            if (resultDurationMs > slowestDurationMs) slowestDurationMs = resultDurationMs;
            if (status === "passed") {
              passed += 1;
              existing.passed += 1;
              existing.total += 1;
            } else if (status === "skipped") {
              skipped += 1;
              existing.skipped += 1;
            } else {
              failed += 1;
              existing.failed += 1;
              existing.total += 1;
              const detail = result.error?.message ?? test.error?.message ?? `Playwright status: ${status}`;
              const errorFile =
                formatFailureFile(result.error?.location?.file, result.error?.location?.line) ?? displayFile;
              failures.push({
                id: `${key}-${failures.length + 1}`,
                feature: key,
                ac,
                title: displayTitle,
                file: errorFile,
                message: detail,
                duration: formatDuration(resultDurationMs),
                flaky: hasRetryPass
              });
            }
          }
          perFeature.set(key, existing);
          slowestTests.push({
            title: displayTitle,
            feature: key,
            duration: formatDuration(slowestDurationMs),
            durationMs: slowestDurationMs
          });
        }
      }
      walk(suite.suites, suiteFeature);
    }
  };

  walk(report.suites, "general");
  const durationMs = report.stats?.duration ?? 0;
  return {
    passed,
    failed,
    skipped,
    flaky,
    total: passed + failed,
    durationMs,
    perFeature,
    failures,
    slowestTests: slowestTests
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map(({ title, feature, duration }) => ({ title, feature, duration }))
  };
}

function slugFromTitle(value: string): string {
  return path
    .basename(value)
    .toLowerCase()
    .replace(/\.spec\.ts$/i, "")
    .replace(/\.story\.md$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatFailureFile(file?: string, line?: number): string | null {
  if (!file) return null;
  if (typeof line === "number" && Number.isFinite(line) && line > 0) return `${file}:${line}`;
  return file;
}

function extractAcTag(title: string): string | null {
  const match = title.match(/\[(AC-\d+)\]/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeDurationMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return "n/a";
  if (durationMs < 1000) return `${durationMs}ms`;
  const secs = durationMs / 1000;
  if (secs < 60) return `${secs.toFixed(2).replace(/\.00$/, "")}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

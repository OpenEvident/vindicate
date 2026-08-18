import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { __resetVscodeMock, __setStatHandler, type Uri } from "../../mocks/vscode";
import { FileWatcherService } from "../../../src/extension/filesystem/FileWatcherService";
import type { ITraceabilityMatcher } from "../../../src/extension/filesystem/TraceabilityMatcher";

describe("FileWatcherService", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), show: vi.fn() };
  const specAnalyzer = { analyzeAll: vi.fn() };
  const traceMatch = vi.fn<ITraceabilityMatcher["match"]>();
  const traceMatchAll = vi.fn<ITraceabilityMatcher["matchAll"]>();
  const traceMatcher: ITraceabilityMatcher = { match: traceMatch, matchAll: traceMatchAll };
  const playwrightReader = { detectOutputPath: vi.fn(), readResults: vi.fn() };
  const metricsCalculator = { calculate: vi.fn() };

  const sampleCore = {
    project: "workspace",
    mode: "BUILD",
    branch: "main",
    specCompleteness: 50,
    testTraceability: 25,
    testHealth: null,
    testFreshnessDays: null,
    health: {
      overall: 40,
      delta: 0,
      grade: "C",
      spec: { value: 50, label: "Spec completeness", weight: 40, ready: true, blurb: "" },
      trace: { value: 25, label: "Traceability", weight: 30, ready: true, blurb: "" },
      pass: { value: 0, label: "Pass rate", weight: 20, ready: false, blurb: "" },
      fresh: { value: 0, label: "Freshness", weight: 10, ready: false, blurb: "" }
    },
    tests: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      durationMs: 0,
      durationLabel: "0s",
      lastRunAt: "Not run",
      lastRunAbs: "Not run",
      config: "playwright.config.ts",
      project: "chromium",
      trend: [0]
    },
    features: [],
    failures: [],
    alerts: [],
    storyWarnings: [],
    acCoverage: { total: 0, covered: 0, drift: 0, missing: 0 },
    specSchema: {
      required: ["Persona", "Feature", "Acceptance Criteria", "Testcases", "Out of Scope"]
    },
    runs: [],
    slowestTests: [],
    healthScore: 40,
    healthGrade: "C",
    healthDelta: 0,
    lastUpdated: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetVscodeMock();
    specAnalyzer.analyzeAll.mockResolvedValue({
      total: 1,
      complete: 1,
      partial: 0,
      missing: 0,
      features: [
        {
          name: "auth",
          status: "complete",
          ac: 1,
          headings: {
            feature: true,
            persona: true,
            acceptanceCriteria: true,
            testcases: true,
            outOfScope: true
          },
          acIds: ["AC-1"],
          specFile: ".vindicate/stories/auth.story.md",
          specMtimeMs: Date.now(),
          words: 10
        }
      ]
    });
    traceMatchAll.mockResolvedValue(new Map([["auth", true]]));
    playwrightReader.detectOutputPath.mockResolvedValue(null);
    playwrightReader.readResults.mockResolvedValue(null);
    metricsCalculator.calculate.mockReturnValue({
      ...sampleCore,
      features: [
        {
          name: "Auth",
          slug: "auth",
          ac: 1,
          linkedTests: 1,
          specStatus: "complete",
          hasTests: true,
          specFile: ".vindicate/stories/auth.story.md",
          headings: {
            feature: true,
            persona: true,
            acceptanceCriteria: true,
            testcases: true,
            outOfScope: true
          },
          words: 10,
          specMod: "recently",
          tests: {
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            flaky: 0
          },
          lastTouched: "recently"
        }
      ]
    });
    __setStatHandler(async (uri: Uri) => {
      if (
        uri.fsPath.endsWith("domain.md") ||
        uri.fsPath.endsWith("context.md") ||
        uri.fsPath.replace(/\\/g, "/").endsWith(".vindicate/stories")
      ) {
        return { type: 1 };
      }
      throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
    });
  });

  it("start calls createFileSystemWatcher for each watch pattern", () => {
    const createWatcher = vi.spyOn(vscode.workspace, "createFileSystemWatcher");
    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    service.start("/project");
    expect(createWatcher).toHaveBeenCalledTimes(4);
    service.dispose();
    createWatcher.mockRestore();
  });

  it("stop clears watchers so a subsequent refresh is a no-op", async () => {
    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    service.start("/project");
    service.stop();
    await service.refresh();
    expect(specAnalyzer.analyzeAll).not.toHaveBeenCalled();
    service.dispose();
  });

  it("refresh emits metrics from calculator", async () => {
    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const metrics: Array<{
      healthScore: number;
      availability: { spec: { ready: boolean } };
      testSuites?: Array<{ relativePath: string; label: string }>;
    }> = [];
    service.onDidMetricsChange((m) => metrics.push(m));
    service.start("/project");
    await service.refresh();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.healthScore).toBe(40);
    expect(metrics[0]?.availability.spec.ready).toBe(true);
    expect(metrics[0]?.testSuites).toEqual([]);
    service.dispose();
  });

  it("emits step complete when domain.md appears after initial scan", async () => {
    specAnalyzer.analyzeAll.mockResolvedValue({
      total: 0,
      complete: 0,
      partial: 0,
      missing: 0,
      features: []
    });
    traceMatchAll.mockResolvedValue(new Map());

    let domainExists = false;
    __setStatHandler(async (uri: Uri) => {
      const normalized = uri.fsPath.replace(/\\/g, "/");
      if (normalized.endsWith(".vindicate/domain.md")) {
        if (!domainExists) {
          throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
        }
        return { type: 1 };
      }
      if (
        normalized.endsWith(".vindicate/context.md") ||
        normalized.endsWith(".vindicate/stories")
      ) {
        return { type: 1 };
      }
      throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
    });

    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const steps: number[] = [];
    service.onDidStepComplete((step) => steps.push(step));
    service.start("/project");
    await service.refresh();
    domainExists = true;
    await service.refresh();
    expect(steps).toEqual([1]);
    service.dispose();
  });

  it("first refresh seeds present steps without emitting step events", async () => {
    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const steps: number[] = [];
    service.onDidStepComplete((step) => steps.push(step));
    service.start("/project");
    await service.refresh();
    expect(steps).toEqual([]);
    expect(service.getLastPresentSteps().has(1)).toBe(true);
    service.dispose();
  });

  it("revokes step 1 when domain.md disappears after initial scan", async () => {
    specAnalyzer.analyzeAll.mockResolvedValue({
      total: 0,
      complete: 0,
      partial: 0,
      missing: 0,
      features: []
    });
    traceMatchAll.mockResolvedValue(new Map());

    let domainExists = true;
    __setStatHandler(async (uri: Uri) => {
      const normalized = uri.fsPath.replace(/\\/g, "/");
      if (normalized.endsWith(".vindicate/domain.md")) {
        if (!domainExists) {
          throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
        }
        return { type: 1 };
      }
      if (
        normalized.endsWith(".vindicate/context.md") ||
        normalized.endsWith(".vindicate/stories")
      ) {
        return { type: 1 };
      }
      throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
    });

    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const revoked: number[] = [];
    service.onDidStepRevoke((step) => revoked.push(step));
    service.start("/project");
    await service.refresh();
    domainExists = false;
    await service.refresh();
    expect(revoked).toContain(1);
    service.dispose();
  });

  it("does not re-emit step complete when presence is unchanged", async () => {
    specAnalyzer.analyzeAll.mockResolvedValue({
      total: 0,
      complete: 0,
      partial: 0,
      missing: 0,
      features: []
    });
    traceMatchAll.mockResolvedValue(new Map());

    let domainExists = false;
    __setStatHandler(async (uri: Uri) => {
      const normalized = uri.fsPath.replace(/\\/g, "/");
      if (normalized.endsWith(".vindicate/domain.md")) {
        if (!domainExists) {
          throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
        }
        return { type: 1 };
      }
      if (
        normalized.endsWith(".vindicate/context.md") ||
        normalized.endsWith(".vindicate/stories")
      ) {
        return { type: 1 };
      }
      throw Object.assign(new Error("ENOENT"), { code: "FileNotFound" });
    });

    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const steps: number[] = [];
    service.onDidStepComplete((step) => steps.push(step));
    service.start("/project");
    await service.refresh();
    domainExists = true;
    await service.refresh();
    await service.refresh();
    expect(steps.filter((s) => s === 1)).toHaveLength(1);
    service.dispose();
  });

  it("fires watch error when refresh fails", async () => {
    specAnalyzer.analyzeAll.mockRejectedValue(new Error("read failed"));
    const service = new FileWatcherService(
      specAnalyzer,
      traceMatcher,
      playwrightReader,
      metricsCalculator,
      logger
    );
    const errors: Error[] = [];
    service.onDidWatchError((err) => errors.push(err));
    service.start(path.join("/project"));
    await service.refresh();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("read failed");
    service.dispose();
  });
});

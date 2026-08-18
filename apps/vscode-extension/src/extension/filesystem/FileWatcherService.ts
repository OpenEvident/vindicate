import * as vscode from "vscode";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { STALE_RESULTS_DAYS } from "../shared/constants";
import { attachMetricAvailability } from "../../shared/metricAvailability";
import type { DashboardMetrics, StepId } from "../../shared/types";
import type { ILogger } from "../shared/logger";
import type { IMetricsCalculator } from "./MetricsCalculator";
import type { IPlaywrightOutputReader } from "./PlaywrightOutputReader";
import type { ISpecAnalyzer } from "./SpecAnalyzer";
import type { ITraceabilityMatcher } from "./TraceabilityMatcher";
import { detectPresentOnboardingSteps } from "./onboardingStepDetection";
import { calculateAcceptanceCoverage } from "./AcceptanceCoverageAnalyzer";
import { analyzeTraceabilityContract } from "./TraceabilityContractAnalyzer";
import { analyzeFaTagUniqueness } from "./FaTagUniquenessAnalyzer";
import { TestFileIndex } from "./TestFileIndex";
import { toTestSuiteOptions } from "./playwrightTestCommand";

export interface IFileWatcherService extends vscode.Disposable {
  getLastPresentSteps(): ReadonlySet<StepId>;
  start(folderPath: string): void;
  stop(): void;
  refresh(folderPathOverride?: string): Promise<void>;
  readonly onWillRefresh: vscode.Event<void>;
  readonly onDidStepComplete: vscode.Event<StepId>;
  readonly onDidStepRevoke: vscode.Event<StepId>;
  readonly onDidMetricsChange: vscode.Event<DashboardMetrics>;
  readonly onDidWatchError: vscode.Event<Error>;
}

export class FileWatcherService implements IFileWatcherService {
  private readonly willRefreshEmitter = new vscode.EventEmitter<void>();
  private readonly stepEmitter = new vscode.EventEmitter<StepId>();
  private readonly stepRevokeEmitter = new vscode.EventEmitter<StepId>();
  private readonly metricsEmitter = new vscode.EventEmitter<DashboardMetrics>();
  private readonly errorEmitter = new vscode.EventEmitter<Error>();
  private watchers: vscode.FileSystemWatcher[] = [];
  private folderPath: string | null = null;
  private lastPresentSteps = new Set<StepId>();
  private skipInitialStepEvents = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight = false;
  private refreshQueued = false;
  private readonly refreshDebounceMs = 1000;
  private branchCache: {
    folderPath: string;
    value: string;
    atMs: number;
  } | null = null;
  private readonly branchCacheTtlMs = 15_000;
  private readonly testFileIndex = new TestFileIndex();

  readonly onWillRefresh = this.willRefreshEmitter.event;
  readonly onDidStepComplete = this.stepEmitter.event;
  readonly onDidStepRevoke = this.stepRevokeEmitter.event;
  readonly onDidMetricsChange = this.metricsEmitter.event;
  readonly onDidWatchError = this.errorEmitter.event;

  constructor(
    private readonly specAnalyzer: ISpecAnalyzer,
    private readonly traceMatcher: ITraceabilityMatcher,
    private readonly playwrightReader: IPlaywrightOutputReader,
    private readonly metricsCalculator: IMetricsCalculator,
    private readonly logger: ILogger
  ) {}

  getLastPresentSteps(): ReadonlySet<StepId> {
    return this.lastPresentSteps;
  }

  start(folderPath: string): void {
    if (this.folderPath === folderPath && this.watchers.length > 0) {
      return;
    }
    this.stop();
    this.folderPath = folderPath;
    this.lastPresentSteps.clear();
    this.skipInitialStepEvents = true;

    const pattern = (relative: string) =>
      new vscode.RelativePattern(vscode.Uri.file(folderPath), relative);

    const domainWatcher = vscode.workspace.createFileSystemWatcher(pattern(".vindicate/domain.md"));
    const contextWatcher = vscode.workspace.createFileSystemWatcher(
      pattern(".vindicate/context.md")
    );
    const featuresWatcher = vscode.workspace.createFileSystemWatcher(
      pattern(".vindicate/stories/*.story.md")
    );
    const testWatcher = vscode.workspace.createFileSystemWatcher(
      pattern("tests/**/*.{spec,test,e2e}.ts")
    );

    const onArtifactChange = () => this.scheduleRefresh();

    domainWatcher.onDidCreate(onArtifactChange);
    domainWatcher.onDidChange(onArtifactChange);
    domainWatcher.onDidDelete(onArtifactChange);

    contextWatcher.onDidCreate(onArtifactChange);
    contextWatcher.onDidChange(onArtifactChange);
    contextWatcher.onDidDelete(onArtifactChange);

    featuresWatcher.onDidCreate(onArtifactChange);
    featuresWatcher.onDidChange(onArtifactChange);
    featuresWatcher.onDidDelete(onArtifactChange);

    testWatcher.onDidCreate(onArtifactChange);
    testWatcher.onDidChange(onArtifactChange);
    testWatcher.onDidDelete(onArtifactChange);

    this.watchers = [domainWatcher, contextWatcher, featuresWatcher, testWatcher];
  }

  stop(): void {
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    this.folderPath = null;
    this.lastPresentSteps.clear();
    this.branchCache = null;
    this.testFileIndex.clear();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.refreshQueued = false;
    this.refreshInFlight = false;
  }

  async refresh(folderPathOverride?: string): Promise<void> {
    this.refreshQueued = true;
    if (this.refreshInFlight) {
      return;
    }
    const previousFolderPath = this.folderPath;
    const useTemporaryFolder =
      typeof folderPathOverride === "string" &&
      folderPathOverride.length > 0 &&
      this.watchers.length === 0;
    if (useTemporaryFolder) {
      this.folderPath = folderPathOverride;
    }
    this.refreshInFlight = true;
    try {
      while (this.refreshQueued) {
        this.refreshQueued = false;
        await this.runRefreshPass();
      }
    } finally {
      this.refreshInFlight = false;
      if (useTemporaryFolder) {
        this.folderPath = previousFolderPath;
      }
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, this.refreshDebounceMs);
  }

  private async runRefreshPass(): Promise<void> {
    if (!this.folderPath) return;
    this.willRefreshEmitter.fire();
    try {
      const featuresDir = path.join(this.folderPath, ".vindicate", "stories");
      const featuresDirExists = await pathExists(featuresDir);
      const specAnalysis = await this.specAnalyzer.analyzeAll(featuresDir);
      const featureNames = specAnalysis.features.map((f) => f.name);
      const testSnapshots = await this.testFileIndex.snapshots(this.folderPath);
      const contract = await analyzeTraceabilityContract(
        this.folderPath,
        specAnalysis.features,
        testSnapshots
      );
      const faWarnings = await analyzeFaTagUniqueness(featuresDir);

      const allExplicitlyCovered = featureNames.every(
        (name) => (contract.explicitTraceability.get(name) ?? false) === true
      );
      const heuristicTraceability = allExplicitlyCovered
        ? new Map<string, boolean>()
        : await this.traceMatcher.matchAll(featureNames, this.folderPath, testSnapshots);
      const traceability = new Map<string, boolean>();
      for (const name of featureNames) {
        const explicit = contract.explicitTraceability.get(name) ?? false;
        const heuristic = heuristicTraceability.get(name) ?? false;
        traceability.set(name, explicit || heuristic);
      }
      const playwrightOutputPath = await this.playwrightReader.detectOutputPath(this.folderPath);
      const playwrightResults = playwrightOutputPath
        ? await this.playwrightReader.readResults(playwrightOutputPath)
        : null;
      const acCoverage = await calculateAcceptanceCoverage(
        this.folderPath,
        specAnalysis.features,
        testSnapshots
      );
      const core = this.metricsCalculator.calculate({
        specAnalysis,
        traceability,
        linkedTestCounts: contract.testCountByFeature,
        playwrightResults,
        acCoverage,
        storyWarnings: [...contract.warnings, ...faWarnings],
        staleThresholdDays: STALE_RESULTS_DAYS
      });
      const branch = await this.getGitBranch(this.folderPath);
      const metrics = attachMetricAvailability(
        {
          ...core,
          project: path.basename(this.folderPath),
          branch,
          testSuites: toTestSuiteOptions(testSnapshots.map((snapshot) => snapshot.relativePath))
        },
        {
          featuresDirExists,
          playwrightResultsFound: playwrightResults !== null
        }
      );
      this.metricsEmitter.fire(metrics);
      await this.reconcileOnboardingSteps(specAnalysis, testSnapshots.length > 0);
    } catch (err) {
      this.errorEmitter.fire(err instanceof Error ? err : new Error(String(err)));
      this.logger.warn(`Metrics refresh failed: ${String(err)}`);
    }
  }

  dispose(): void {
    this.stop();
    this.willRefreshEmitter.dispose();
    this.stepEmitter.dispose();
    this.stepRevokeEmitter.dispose();
    this.metricsEmitter.dispose();
    this.errorEmitter.dispose();
  }

  private async getGitBranch(folderPath: string): Promise<string> {
    const nowMs = Date.now();
    if (
      this.branchCache &&
      this.branchCache.folderPath === folderPath &&
      nowMs - this.branchCache.atMs < this.branchCacheTtlMs
    ) {
      return this.branchCache.value;
    }

    const value = await gitBranch(folderPath);
    this.branchCache = { folderPath, value, atMs: nowMs };
    return value;
  }

  private async reconcileOnboardingSteps(
    specAnalysis: Awaited<ReturnType<ISpecAnalyzer["analyzeAll"]>>,
    hasTestFiles: boolean
  ): Promise<void> {
    const present = await detectPresentOnboardingSteps(
      this.folderPath!,
      specAnalysis,
      hasTestFiles
    );

    if (this.skipInitialStepEvents) {
      this.lastPresentSteps = present;
      this.skipInitialStepEvents = false;
      return;
    }

    for (const step of present) {
      if (!this.lastPresentSteps.has(step)) {
        this.stepEmitter.fire(step);
      }
    }

    for (const step of this.lastPresentSteps) {
      if (!present.has(step)) {
        this.stepRevokeEmitter.fire(step);
      }
    }

    this.lastPresentSteps = present;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

const execFileAsync = promisify(execFile);

async function gitBranch(folderPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: folderPath
    });
    const branch = stdout.trim();
    return branch.length > 0 ? branch : "main";
  } catch {
    return "main";
  }
}

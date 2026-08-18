export type Mode = "build" | "fix" | "structure" | "bridge";

export type StepId = 1 | 2 | 3 | 4;

export interface VindicateWorkspaceState {
  selectedMode: Mode | null;
  completedSteps: StepId[];
  onboardingDone: boolean;
  toolsConfirmed: boolean;
}

export interface ServiceHealth {
  runtime: "up" | "down" | "unknown";
  mcp: "up" | "down" | "unknown";
}

export type MetricId = "spec" | "trace" | "testHealth" | "freshness" | "health";

export interface MetricState {
  ready: boolean;
  reason: string;
  dependsOn?: MetricId[];
  blockedBy?: string[];
}

export interface MetricAvailability {
  spec: MetricState;
  trace: MetricState;
  testHealth: MetricState;
  freshness: MetricState;
  health: MetricState;
}

export interface DashboardMetrics {
  project: string;
  mode: string;
  branch: string;
  specCompleteness: number;
  testTraceability: number;
  testHealth: TestHealthData | null;
  testFreshnessDays: number | null;
  health: HealthMetrics;
  tests: TestSummary;
  features: FeatureStatus[];
  failures: FailingTest[];
  alerts: DashboardAlert[];
  storyWarnings: StoryTraceWarning[];
  acCoverage: AcceptanceCriteriaCoverage;
  specSchema: SpecSchema;
  runs: TestRunSummary[];
  slowestTests: SlowTest[];
  healthScore: number;
  healthGrade: string;
  healthDelta: number;
  lastUpdated: string;
  availability: MetricAvailability;
  /** Playwright spec files under `tests/`. Optional so health formulas stay unchanged. */
  testSuites?: TestSuiteOption[];
}

export interface TestSuiteOption {
  relativePath: string;
  label: string;
}

export type PromptCategory = "onboarding" | "domain" | "specs" | "tests" | "custom";

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestHealthData {
  passed: number;
  failed: number;
  total: number;
}

export interface FeatureStatus {
  name: string;
  slug: string;
  ac: number;
  linkedTests: number;
  specStatus: "complete" | "partial" | "missing";
  hasTests: boolean;
  specFile: string | null;
  headings: SpecHeadings;
  words: number;
  specMod: string | null;
  tests: FeatureTestStatus;
  lastTouched: string | null;
}

export interface HealthMetricPart {
  value: number;
  delta?: number;
  label: string;
  weight: number;
  ready: boolean;
  blurb: string;
}

export interface HealthMetrics {
  overall: number;
  delta: number;
  grade: string;
  spec: HealthMetricPart;
  trace: HealthMetricPart;
  pass: HealthMetricPart;
  fresh: HealthMetricPart;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
  durationLabel: string;
  lastRunAt: string;
  lastRunAbs: string;
  config: string;
  project: string;
  trend: number[];
}

export interface FeatureTestStatus {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
}

export interface SpecHeadings {
  feature: boolean;
  persona: boolean;
  acceptanceCriteria: boolean;
  testcases: boolean;
  outOfScope: boolean;
}

export interface FailingTest {
  id: string;
  feature: string;
  ac: string;
  title: string;
  file: string;
  message: string;
  duration: string;
  flaky: boolean;
}

export interface DashboardAlert {
  kind: string;
  severity: "warn" | "info" | "ok";
  title: string;
  sub: string;
  action: string;
}

export interface StoryTraceWarning {
  kind:
    | "missing-spec-header"
    | "missing-scenario-comment"
    | "missing-ac-tag"
    | "ac-tag-not-first"
    | "multi-ac-tag"
    | "unknown-ac-tag"
    | "missing-ac-coverage"
    | "duplicate-fa-tag"
    | "spec-story-count-mismatch"
    | "scenario-name-mismatch"
    | "story-needs-update";
  severity: "warn";
  file: string;
  line: number | null;
  feature: string | null;
  title: string;
  detail: string;
}

export interface AcceptanceCriteriaCoverage {
  total: number;
  covered: number;
  drift: number;
  missing: number;
}

export interface SpecSchema {
  required: string[];
}

export interface TestRunSummary {
  id: string;
  at: string;
  abs: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  commit: string;
  trigger: string;
  branch: string;
}

export interface SlowTest {
  title: string;
  feature: string;
  duration: string;
}

export type McpToolName = "cursor" | "vscode" | "claudeCode" | "antigravity";

export type ConfigStatuses = Record<
  McpToolName | "cursorRule" | "agentMd" | "copilotInstructions" | "agentSkill" | "antigravityRule",
  boolean
>;

export interface SelectedTools {
  cursor: boolean;
  vscode: boolean;
  claudeCode: boolean;
  antigravity: boolean;
}

export const EMPTY_SELECTED_TOOLS: SelectedTools = {
  cursor: false,
  vscode: false,
  claudeCode: false,
  antigravity: false
};

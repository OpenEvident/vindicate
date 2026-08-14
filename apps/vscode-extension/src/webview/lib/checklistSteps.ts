import type { Mode, SelectedTools, StepId } from "./types";
import type { Screen } from "../../shared/messages";

export interface ChecklistStep {
  index: number;
  title: string;
  subtitle: string;
  status: "done" | "active" | "locked";
  clickable: boolean;
}

interface DeriveParams {
  screen: Screen;
  completedSteps: StepId[];
  mode: Mode | null;
  confirmedTools: SelectedTools | null;
  detectedTools: SelectedTools;
  hasFolder: boolean;
  onboardingDone: boolean;
  extensionVersion: string;
}

function toolSubtitle(tools: SelectedTools | null, detected: SelectedTools): string {
  const source = tools ?? detected;
  const names: string[] = [];
  if (source.cursor) names.push("Cursor");
  if (source.claudeCode) names.push("Claude Code");
  if (source.vscode) names.push("VS Code");
  if (source.antigravity) names.push("Antigravity");
  return names.length > 0 ? names.join(" · ") : "No agents selected";
}

export function deriveChecklistSteps(params: DeriveParams): ChecklistStep[] {
  const {
    screen,
    mode,
    confirmedTools,
    detectedTools,
    onboardingDone,
    extensionVersion
  } = params;

  const toolsConfirmed =
    screen === "modeSelection" ||
    screen === "scaffold" ||
    screen === "gettingStarted" ||
    screen === "dashboard" ||
    onboardingDone;

  const modeConfirmed =
    (mode !== null && (screen === "scaffold" || screen === "gettingStarted" || screen === "dashboard")) ||
    onboardingDone;

  const step1: ChecklistStep = {
    index: 1,
    title: "Extension installed",
    subtitle: `v${extensionVersion} · Ready`,
    status: "done",
    clickable: false
  };

  const step2: ChecklistStep = {
    index: 2,
    title: "Connect your AI coding agents",
    subtitle: toolsConfirmed
      ? toolSubtitle(confirmedTools, detectedTools)
      : "We'll auto-detect what's installed",
    status: toolsConfirmed ? "done" : "active",
    clickable: toolsConfirmed
  };

  const step3: ChecklistStep = {
    index: 3,
    title: "Tell Vindicate where you're starting",
    subtitle: modeConfirmed && mode ? `${mode.charAt(0).toUpperCase()}${mode.slice(1)} mode` : "Build · Fix · Structure · Bridge",
    status: modeConfirmed ? "done" : toolsConfirmed ? "active" : "locked",
    clickable: modeConfirmed
  };

  const step4: ChecklistStep = {
    index: 4,
    title: "Scaffold your project structure",
    subtitle: onboardingDone ? "Setup complete" : "Domain · Specs · Test suite",
    status: onboardingDone ? "done" : modeConfirmed ? "active" : "locked",
    clickable: onboardingDone
  };

  return [step1, step2, step3, step4];
}

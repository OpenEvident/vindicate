import type {
  LocatorCandidate,
  PreviewTarget,
  RecordingStep,
  PageSnapshot
} from "@/lib/recording-ui-types";

type StepWithSnapshotFields = RecordingStep & {
  readonly page_snapshot?: PageSnapshot;
};

export function getStepPageSnapshot(step: StepWithSnapshotFields): PageSnapshot | undefined {
  return step.pageSnapshot ?? step.page_snapshot;
}

type StepWithEnvFields = RecordingStep & {
  readonly env_var?: boolean;
  readonly env_var_name?: string;
};

export function isStepEnvVar(step: StepWithEnvFields): boolean {
  return step.envVar === true || step.env_var === true;
}

export function getStepEnvVarName(step: StepWithEnvFields): string | undefined {
  const name = step.envVarName ?? step.env_var_name;
  if (name === undefined) {
    return undefined;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function formatStepEnvVarLabel(step: StepWithEnvFields): string {
  const name = getStepEnvVarName(step);
  return name !== undefined ? `Env var · ${name}` : "Env var / sensitive";
}

function stepPageUrl(step: StepWithSnapshotFields): string | undefined {
  const snapshotUrl = getStepPageSnapshot(step)?.url?.trim();
  if (snapshotUrl !== undefined && snapshotUrl.length > 0) {
    return snapshotUrl;
  }
  const url = step.url?.trim();
  if (url !== undefined && url.length > 0) {
    return url;
  }
  return undefined;
}

export function deriveTargetUrlFromSteps(steps: readonly RecordingStep[]): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const url = stepPageUrl(steps[i]!);
    if (url !== undefined) {
      return url;
    }
  }
  return "";
}

export function resolvePreviewUrl(
  previewTarget: PreviewTarget,
  captionStep: RecordingStep | undefined,
  steps: readonly RecordingStep[],
  targetUrl: string | null
): string {
  if (captionStep !== undefined) {
    const fromStep = stepPageUrl(captionStep);
    if (fromStep !== undefined) {
      return fromStep;
    }
  }

  if (previewTarget.type === "step") {
    const idx = steps.findIndex((s) => s.seq === previewTarget.seq);
    for (let i = idx; i >= 0; i--) {
      const url = stepPageUrl(steps[i]!);
      if (url !== undefined) {
        return url;
      }
    }
  }

  if (previewTarget.type === "final") {
    const derived = deriveTargetUrlFromSteps(steps);
    if (derived.length > 0) {
      return derived;
    }
  }

  const fallback = targetUrl?.trim();
  if (fallback !== undefined && fallback.length > 0) {
    return fallback;
  }

  return "about:blank";
}

export function getCandidateStrategyLabel(candidate: LocatorCandidate): string {
  if (candidate.strategy === "scoped") {
    return "scoped / parameterizable";
  }
  if (candidate.strategy === "sibling_text") {
    return "sibling text";
  }
  if (
    candidate.strategy === "testid" &&
    candidate.attr !== undefined &&
    candidate.attr.length > 0
  ) {
    return candidate.attr;
  }
  return candidate.strategy;
}

export function getTargetLabel(step: RecordingStep): string {
  if (step.action === "snapshot") {
    const title = getStepPageSnapshot(step)?.title?.trim();
    if (title !== undefined && title.length > 0) return title;
    if (step.url !== undefined && step.url.length > 0) return step.url;
    return "Page snapshot";
  }
  if (step.action === "drag") {
    const source = step.element?.name?.trim() || step.element?.tag || "source";
    const target = step.target?.element?.name?.trim() || step.target?.element?.tag || "target";
    return `${source} → ${target}`;
  }
  if (step.action === "new_tab") {
    return step.url !== undefined && step.url.length > 0
      ? `Opened tab: ${step.url}`
      : "Opened a new tab";
  }
  if (step.action === "switch_tab_by_url") {
    return step.url !== undefined && step.url.length > 0
      ? `Switched to tab: ${step.url}`
      : "Switched tab";
  }
  if (step.action === "switch_tab") {
    const target =
      step.url !== undefined && step.url.length > 0 ? step.url : `#${step.index ?? "?"}`;
    return `Switched to tab: ${target}`;
  }
  if (step.action === "close_tab") {
    return step.url !== undefined && step.url.length > 0 ? `Closed tab: ${step.url}` : "Closed tab";
  }
  if (step.action === "upload_file" && step.files !== undefined && step.files.length > 0) {
    return step.files.join(", ");
  }
  const name = step.element?.name?.trim();
  const tag = step.element?.tag ?? "element";
  const role = step.element?.role;
  if (name !== undefined && name.length > 0) {
    const kind = role === "button" || tag === "button" ? "button" : tag;
    return `"${name}" ${kind}`;
  }
  if (step.url !== undefined && step.url.length > 0) return step.url;
  if (step.key !== undefined && step.key.length > 0) return step.key;
  return tag;
}

export function getNavigationTrigger(
  step: RecordingStep & { navigation_trigger?: "explicit" | "implicit" }
): "explicit" | "implicit" | undefined {
  return step.navigationTrigger ?? step.navigation_trigger;
}

export function normalizeRecordingStep(step: RecordingStep): RecordingStep {
  const navigationTrigger = getNavigationTrigger(
    step as RecordingStep & { navigation_trigger?: "explicit" | "implicit" }
  );
  if (navigationTrigger === undefined) {
    return step;
  }
  return { ...step, navigationTrigger };
}

export function formatNavigationStepSummary(
  step: RecordingStep & { navigation_trigger?: "explicit" | "implicit" },
  steps?: readonly RecordingStep[],
  previousSeq?: number
): string {
  const trigger = getNavigationTrigger(step);
  if (trigger === "implicit") {
    let prev = previousSeq;
    if (prev === undefined && steps !== undefined) {
      for (let i = steps.length - 1; i >= 0; i--) {
        const candidate = steps[i]!;
        if (candidate.seq >= step.seq) {
          continue;
        }
        if (candidate.action === "snapshot" || candidate.action === "navigate") {
          continue;
        }
        prev = candidate.seq;
        break;
      }
    }
    if (prev === undefined) {
      prev = Math.max(1, step.seq - 1);
    }
    return `Automatic: caused by step ${prev}, not a separate browser action.`;
  }
  if (trigger === "explicit") {
    return "Manual: browser opened or navigated to this URL directly.";
  }
  return "URL change recorded for this step.";
}

export function formatSnapshotSummary(snapshot: PageSnapshot | undefined): string | null {
  if (snapshot === undefined) return null;
  const parts: string[] = [
    `${snapshot.elements.length} element${snapshot.elements.length === 1 ? "" : "s"}`
  ];
  const alertCount = snapshot.alerts?.length ?? 0;
  if (alertCount > 0) parts.push(`${alertCount} alert${alertCount === 1 ? "" : "s"}`);
  if (snapshot.truncated === true) parts.push("truncated");
  return parts.join(" · ");
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  return `${diffDay} days ago`;
}

export function renumberSteps(steps: RecordingStep[]): RecordingStep[] {
  return steps.map((step, index) => ({ ...step, seq: index + 1 }));
}

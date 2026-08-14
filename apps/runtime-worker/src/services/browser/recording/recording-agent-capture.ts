/** DOM interaction events suppressed during agent recording — captured via addAgentStep instead. */
export const AGENT_DOM_SUPPRESSED_ACTIONS = new Set([
  "click",
  "fill",
  "select",
  "check",
  "uncheck",
  "press_key",
  "scroll",
  "upload_file",
  "hover",
  "drag",
  "dblclick"
]);

export function shouldSuppressAgentDomEvent(
  startedBy: "human" | "agent" | undefined,
  action: string
): boolean {
  return startedBy === "agent" && AGENT_DOM_SUPPRESSED_ACTIONS.has(action);
}

export function shouldSkipDuplicateNavigateStep(
  steps: ReadonlyArray<{ action: string; url?: string }>,
  url: string | undefined
): boolean {
  if (url === undefined || steps.length === 0) {
    return false;
  }
  const last = steps[steps.length - 1]!;
  return last.action === "navigate" && last.url === url;
}

const INTERACTION_ACTIONS = new Set(["click", "dblclick", "press_key"]);

/** Classify a synthesized navigate step as explicit (typed URL) or implicit (follows interaction). */
export function classifyNavigation(
  steps: ReadonlyArray<{ action: string; timestamp: string }>,
  nowMs: number,
  windowMs = 2500
): "explicit" | "implicit" {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (step.action === "navigate") {
      continue;
    }
    if (INTERACTION_ACTIONS.has(step.action)) {
      const elapsed = nowMs - Date.parse(step.timestamp);
      return elapsed <= windowMs ? "implicit" : "explicit";
    }
    return "explicit";
  }
  return "explicit";
}

export function isRealPageUrl(url: string): boolean {
  return url.length > 0 && !url.startsWith("about:");
}

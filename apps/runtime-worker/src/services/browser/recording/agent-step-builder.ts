import type { StructuredLocator } from "@vindicate/protocol";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import type { CommandStepInput } from "../commands/command-executor.js";
import type { AgentStepPayload, SelectorCandidatePayload } from "./recording.types.js";

const RECORDABLE_ACTIONS = new Set([
  "click",
  "fill",
  "select",
  "check",
  "uncheck",
  "press_key",
  "scroll",
  "navigate",
  "snapshot",
  "upload_file",
  "hover",
  "drag",
  "dblclick"
]);

const COMMAND_TO_RECORDED_ACTION: Record<string, string> = {
  select_option: "select",
  scroll_by: "scroll",
  type: "fill"
};

/** Tab/popup actions — recorded verbatim (no descriptor/ref involved), driven by the command's own
 * result rather than a captured element. Kept as their own branch below since they share none of the
 * ref/candidate machinery the rest of buildAgentStepPayload uses. */
const TAB_ACTIONS = new Set(["new_tab", "switch_tab", "switch_tab_by_url", "close_tab"]);

/** Map a verified structured locator to a recording candidate (unified vocabulary; never CSS). */
function candidateFromLocator(loc: StructuredLocator): SelectorCandidatePayload {
  const value =
    loc.value ??
    loc.xpath ??
    (loc.role !== undefined
      ? `${loc.role}${loc.name !== undefined ? `[name="${loc.name}"]` : ""}`
      : "");
  return {
    strategy: loc.strategy,
    value,
    ...(loc.attr !== undefined ? { attr: loc.attr } : {}),
    strength: loc.confidence === "high" ? "strong" : "weak",
    ...(loc.container !== undefined ? { container: loc.container } : {}),
    // browser_act already verified this locator inside its iframe boundary (see frame-capture.ts) —
    // forward it so an agent recording of a click inside an iframe replays inside that same iframe
    // instead of resolving (or mis-resolving) against the top page.
    ...(loc.frame_path !== undefined && loc.frame_path.length > 0
      ? { frame_path: [...loc.frame_path] }
      : {}),
    // Forward click-delegate status so a finalized recording — and any codegen schema an agent
    // transcribes from it — still knows this candidate targets a delegate ancestor, not the element
    // its role/name imply. Without this, the signal computed at capture (interactive-capture.evaluate.ts)
    // was silently lost the moment a click got recorded, even though browser_act itself already knew.
    ...(loc.click_delegate === true ? { click_delegate: true } : {})
  };
}

function buildCandidatesFromDescriptor(descriptor: ElementDescriptor): SelectorCandidatePayload[] {
  const candidates: SelectorCandidatePayload[] = [];
  // Primary: the verified structured locator (drives the chosen candidate).
  if (descriptor.locator !== undefined) {
    candidates.push(candidateFromLocator(descriptor.locator));
  }
  // Secondary informational candidates in the unified vocabulary — no CSS, no `#domId`.
  if (descriptor.testid !== undefined && descriptor.locator?.strategy !== "testid") {
    candidates.push({
      strategy: "testid",
      value: descriptor.testid,
      attr: descriptor.testidAttr,
      strength: "strong"
    });
  }
  if (descriptor.name.length > 0 && descriptor.locator?.strategy !== "role_name") {
    candidates.push({
      strategy: "role_name",
      value: `${descriptor.role}[name="${descriptor.name}"]`,
      strength: "medium"
    });
  }
  return candidates;
}

function buildElementMeta(descriptor: ElementDescriptor): AgentStepPayload["element"] {
  return {
    role: descriptor.role,
    name: descriptor.name,
    tag: descriptor.tag,
    ...(descriptor.domId !== undefined ? { id: descriptor.domId } : {}),
    ...(descriptor.placeholder !== undefined ? { placeholder: descriptor.placeholder } : {})
  };
}

export function isRecordableAgentAction(action: string): boolean {
  if (TAB_ACTIONS.has(action)) {
    return true;
  }
  const mapped = COMMAND_TO_RECORDED_ACTION[action] ?? action;
  return RECORDABLE_ACTIONS.has(mapped);
}

export function mapCommandActionToRecorded(action: string): string {
  return COMMAND_TO_RECORDED_ACTION[action] ?? action;
}

/**
 * `result` is whatever the live tab.handlers.ts function returned (`{tabIndex,url}` for new_tab,
 * `{title,url}` for switch_tab/switch_tab_by_url, `{closed:true}` for close_tab) — the resolved page's
 * *actual* URL, not just the input pattern, so replay's own switch_tab_by_url can match confidently even
 * when the popup's URL bounced/redirected before the agent switched to it.
 */
function resultUrl(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const url = (result as Record<string, unknown>)["url"];
  return typeof url === "string" ? url : undefined;
}

function buildTabActionPayload(step: CommandStepInput, result: unknown): AgentStepPayload {
  const url =
    resultUrl(result) ??
    (typeof step["url"] === "string" ? step["url"] : undefined) ??
    (typeof step["url_pattern"] === "string" ? step["url_pattern"] : undefined);
  const index = typeof step["index"] === "number" ? step["index"] : undefined;
  return {
    action: step.action,
    timestamp: new Date().toISOString(),
    actor: "agent",
    chosen: null,
    candidates: [],
    ...(url !== undefined ? { url } : {}),
    ...(index !== undefined ? { index } : {})
  };
}

export function buildAgentStepPayload(
  step: CommandStepInput,
  getDescriptor: (ref: string) => ElementDescriptor | undefined,
  result?: unknown
): AgentStepPayload | undefined {
  const action = step.action;
  if (!isRecordableAgentAction(action)) {
    return undefined;
  }

  if (TAB_ACTIONS.has(action)) {
    return buildTabActionPayload(step, result);
  }

  const recordedAction = mapCommandActionToRecorded(action);
  const ref = typeof step.ref === "string" ? step.ref : undefined;
  const descriptor = ref !== undefined ? getDescriptor(ref) : undefined;
  const candidates = descriptor !== undefined ? buildCandidatesFromDescriptor(descriptor) : [];
  const chosen = candidates[0] ?? null;

  const toRef = typeof step.to_ref === "string" ? step.to_ref : undefined;
  const targetDescriptor = toRef !== undefined ? getDescriptor(toRef) : undefined;
  const target =
    targetDescriptor !== undefined
      ? {
          candidates: buildCandidatesFromDescriptor(targetDescriptor),
          chosen: buildCandidatesFromDescriptor(targetDescriptor)[0] ?? null,
          element: buildElementMeta(targetDescriptor)
        }
      : undefined;

  return {
    action: recordedAction,
    timestamp: new Date().toISOString(),
    actor: "agent",
    chosen,
    candidates,
    ...(descriptor !== undefined ? { element: buildElementMeta(descriptor) } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(typeof step.value === "string" ? { text: step.value } : {}),
    ...(typeof step.url === "string" ? { url: step.url } : {}),
    ...(typeof step.key === "string" ? { key: step.key } : {}),
    ...(Array.isArray(step.files)
      ? { files: step.files.filter((f): f is string => typeof f === "string") }
      : {})
  };
}

/**
 * @file Stateless workflow progress — phase spine + done/active/pending from agent-carried state.
 */
import type { GraphDoc } from "../../content/graph-types.js";
import type { GraphId } from "../../content/content-service.interface.js";

export type PhaseStatus = "done" | "active" | "pending";

export interface WorkflowPhaseRow {
  readonly id: string;
  readonly label: string;
  readonly status: PhaseStatus;
}

export interface BuildWorkflowPhasesInput {
  readonly graph: GraphDoc;
  readonly path: string;
  readonly activeNode?: string;
  readonly completed?: readonly string[];
}

export interface BuildWorkflowPhasesResult {
  readonly phases: WorkflowPhaseRow[];
  readonly warnings: string[];
}

/** Happy-path spine per entry path (excludes branch-only nodes like escalate). */
const MAIN_PATH_SPINES: Record<string, readonly string[]> = {
  write: ["understand", "ground", "design", "generate", "execute", "audit"],
  fix: ["heal", "ground", "generate", "execute", "audit"],
  flaky: ["heal", "generate", "execute", "audit"],
  refactor: ["design", "generate", "execute", "audit"],
  gaps: ["ground", "coverage", "audit"],
  coverage: ["coverage", "audit"],
  smoke: ["execute", "audit"],
  requirements: ["requirements"]
};

const SETUP_PATH_SPINES: Record<string, readonly string[]> = {
  bootstrap: ["understand", "scaffold", "install", "ci-setup", "smoke", "audit"],
  ci: ["ci-setup", "smoke", "audit"]
};

const SIDE_LOOP_NODES = new Set(["heal", "escalate"]);

export function spineForPath(graphId: GraphId, path: string, graph: GraphDoc): string[] {
  const mapped = graphId === "setup" ? SETUP_PATH_SPINES[path] : MAIN_PATH_SPINES[path];
  if (mapped !== undefined) {
    return [...mapped];
  }
  const entry = graph.entryPoints[path];
  if (entry === undefined) {
    return graph.loop !== undefined ? [...graph.loop] : [];
  }
  const loop = graph.loop ?? Object.keys(graph.nodes);
  const start = loop.indexOf(entry);
  if (start < 0) {
    return [entry];
  }
  const end = loop.indexOf("audit");
  return end >= start ? loop.slice(start, end + 1) : loop.slice(start);
}

function nodeLabel(graph: GraphDoc, nodeId: string): string {
  return graph.nodes[nodeId]?.label ?? nodeId.replace(/_/g, " ");
}

function insertActiveOffSpine(spine: string[], activeNode: string): string[] {
  if (spine.includes(activeNode)) {
    return spine;
  }
  if (activeNode === "heal") {
    const executeIdx = spine.indexOf("execute");
    if (executeIdx >= 0) {
      return [...spine.slice(0, executeIdx), "heal", ...spine.slice(executeIdx)];
    }
  }
  if (activeNode === "escalate") {
    return [...spine, "escalate"];
  }
  return [...spine, activeNode];
}

function inferCompleted(spine: string[], activeNode: string): Set<string> {
  const idx = spine.indexOf(activeNode);
  if (idx <= 0) {
    return new Set<string>();
  }
  return new Set(spine.slice(0, idx));
}

export function buildWorkflowPhases(input: BuildWorkflowPhasesInput): BuildWorkflowPhasesResult {
  const warnings: string[] = [];
  const graph = input.graph;
  const path = input.path;

  let spine = spineForPath(graph.graphId, path, graph);
  if (spine.length === 0) {
    warnings.push(`no phase spine for path '${path}'`);
    return { phases: [], warnings };
  }

  const activeNode = input.activeNode;
  if (activeNode !== undefined) {
    if (graph.nodes[activeNode] === undefined) {
      warnings.push(`unknown active node '${activeNode}'`);
    } else {
      spine = insertActiveOffSpine(spine, activeNode);
    }
  }

  const completedSet = new Set<string>(
    input.completed !== undefined && input.completed.length > 0
      ? input.completed
      : activeNode !== undefined
        ? [...inferCompleted(spine, activeNode)]
        : []
  );

  for (const id of completedSet) {
    if (!spine.includes(id) && !SIDE_LOOP_NODES.has(id)) {
      warnings.push(`completed node '${id}' is not on the ${path} spine`);
    }
  }

  if (activeNode !== undefined && completedSet.has(activeNode)) {
    warnings.push(
      `active node '${activeNode}' is also listed in completed — remove it from completed`
    );
  }

  const phases: WorkflowPhaseRow[] = spine.map((id) => {
    let status: PhaseStatus = "pending";
    if (completedSet.has(id)) {
      status = "done";
    } else if (activeNode !== undefined && id === activeNode) {
      status = "active";
    }
    return { id, label: nodeLabel(graph, id), status };
  });

  return { phases, warnings };
}

export function buildProgressEcho(input: {
  path: string;
  node?: string;
  completed?: readonly string[];
}): { path: string; node?: string; completed: string[] } {
  const completed =
    input.completed !== undefined && input.completed.length > 0
      ? [...input.completed]
      : input.node !== undefined
        ? []
        : [];
  return {
    path: input.path,
    ...(input.node !== undefined ? { node: input.node } : {}),
    completed
  };
}

export function suggestNextWorkflowCall(input: {
  path: string;
  nodeView: { node: string; outgoingEdges: { to: string; when: string }[]; terminal: boolean };
  completed: readonly string[];
}): string | undefined {
  if (input.nodeView.terminal) {
    if (input.nodeView.node === "audit") {
      return "Call vindicate_show_panel panel_type:workflow-complete with audit summary, then close.";
    }
    return undefined;
  }
  const next = input.nodeView.outgoingEdges[0]?.to;
  if (next === undefined) {
    return undefined;
  }
  const done = [...input.completed, input.nodeView.node];
  const doneJson = JSON.stringify(done);
  return (
    `When done, call vindicate_workflow(path:${JSON.stringify(input.path)}, ` +
    `node:${JSON.stringify(next)}, from:${JSON.stringify(input.nodeView.node)}, completed:${doneJson}).`
  );
}

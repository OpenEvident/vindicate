export const CANONICAL_TOOLS = [
  "vindicate_workflow",
  "vindicate_validate_story",
  "vindicate_approve_story",
  "vindicate_generate_code",
  "scaffold_project",
  "run_tests",
  "vindicate_ask_user",
  "vindicate_design",
  "vindicate_show_panel",
  "browser_session",
  "browser_navigate",
  "browser_read",
  "browser_diagnose",
  "browser_act",
  "browser_fill_form",
  "browser_assert",
  "browser_record_start",
  "browser_record_finalize",
  "browser_record_discard",
  "browser_record_list",
  "browser_record_read",
  "browser_record_annotate",
  "browser_record_get"
] as const;

export const SUBSTITUTABLE_VARS = [
  "testIdAttribute",
  "baseUrl",
  "framework",
  "packageManager"
] as const;

const TOOL_PATTERN = /\b(vindicate_[a-z_]+|browser_[a-z_]+|scaffold_project|run_tests)\b/g;

export interface ContentValidationResult {
  readonly ok: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface GraphDocForValidation {
  graphId: string;
  entryPoints: Record<string, string>;
  nodes: Record<
    string,
    {
      terminal: boolean;
      edges: Array<{ to: string; when: string }>;
    }
  >;
}

export interface NodeDocForValidation {
  nodeId: string;
  graphId: string;
  refs: string[];
  body: string;
}

export function validateGraphStructure(graph: GraphDocForValidation): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(Object.keys(graph.nodes));

  for (const [path, entry] of Object.entries(graph.entryPoints)) {
    if (!nodeIds.has(entry)) {
      errors.push(`${graph.graphId}: entry path '${path}' → unknown node '${entry}'`);
    }
  }

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.terminal) {
      if (node.edges.length > 0) {
        errors.push(`${graph.graphId}/${nodeId}: terminal node must have no outgoing edges`);
      }
      continue;
    }
    if (node.edges.length < 1) {
      errors.push(`${graph.graphId}/${nodeId}: non-terminal node must have ≥1 outgoing edge`);
    }
    for (const edge of node.edges) {
      if (!nodeIds.has(edge.to)) {
        errors.push(
          `${graph.graphId}/${nodeId}: edge target '${edge.to}' is not defined in the graph`
        );
      }
    }
  }

  const reachable = reachableFromEntries(graph);
  for (const nodeId of nodeIds) {
    if (!reachable.has(nodeId)) {
      errors.push(`${graph.graphId}/${nodeId}: orphaned node (not reachable from any entry point)`);
    }
  }

  return { errors, warnings };
}

export function validateNodeRefs(
  nodes: NodeDocForValidation[],
  availableRefs: ReadonlySet<string>
): string[] {
  const errors: string[] = [];
  for (const node of nodes) {
    for (const ref of node.refs) {
      if (!availableRefs.has(ref)) {
        errors.push(`${node.graphId}/${node.nodeId}: unknown ref '${ref}'`);
      }
    }
  }
  return errors;
}

export function validateNodeTools(nodes: NodeDocForValidation[]): string[] {
  const errors: string[] = [];
  const allowed = new Set<string>(CANONICAL_TOOLS);
  for (const node of nodes) {
    const mentioned = new Set<string>();
    for (const match of node.body.matchAll(TOOL_PATTERN)) {
      mentioned.add(match[1]!);
    }
    for (const tool of mentioned) {
      if (!allowed.has(tool)) {
        errors.push(`${node.graphId}/${node.nodeId}: unknown tool '${tool}' in node body`);
      }
    }
  }
  return errors;
}

export function validateUnsubstitutedVars(content: string, context: string): string[] {
  const warnings: string[] = [];
  const varPattern = /\{\{([a-zA-Z]+)\}\}/g;
  for (const match of content.matchAll(varPattern)) {
    const name = match[1]!;
    if (!(SUBSTITUTABLE_VARS as readonly string[]).includes(name)) {
      warnings.push(`${context}: unsubstituted placeholder '{{${name}}}'`);
    }
  }
  return warnings;
}

function reachableFromEntries(graph: GraphDocForValidation): Set<string> {
  const reachable = new Set<string>();
  const queue = Object.values(graph.entryPoints);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    const node = graph.nodes[current];
    if (node === undefined) {
      continue;
    }
    for (const edge of node.edges) {
      if (!reachable.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }
  return reachable;
}

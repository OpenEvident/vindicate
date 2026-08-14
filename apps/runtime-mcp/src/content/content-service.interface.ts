import type { GraphDoc } from "./graph-types.js";

export type GraphId = "main" | "setup";

export interface PathEntry {
  readonly graphId: GraphId;
  readonly nodeId: string;
}

export interface WorkflowMap {
  graphId: GraphId;
  mermaid: string;
  entryRouting: { path: string; node: string; why: string }[];
  pickEntry?: string;
}

export interface NodeView {
  node: string;
  markdown: string;
  outgoingEdges: { to: string; when: string }[];
  softWarning?: string;
  terminal: boolean;
}

export interface GetNodeInput {
  node: string;
  from?: string;
  mode?: string;
}

export interface IContentService {
  getMap(path?: string): WorkflowMap;
  getGraph(graphId: GraphId): GraphDoc;
  resolvePathEntry(path: string): PathEntry | undefined;
  getNode(input: GetNodeInput): NodeView;
  getSetupSkill(mode: "bootstrap" | "ci"): NodeView;
  listNodeIds(graphId?: GraphId): string[];
  /** Bundled workflow-progress ref (used on orient and first path call). */
  getWorkflowProgressGuide(): string;
}


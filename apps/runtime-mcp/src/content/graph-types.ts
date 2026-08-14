import type { GraphId } from "./content-service.interface.js";

export interface GraphEdge {
  to: string;
  when: string;
}

export interface GraphNodeDef {
  label: string;
  terminal: boolean;
  modes: string[];
  edges: GraphEdge[];
}

export interface GraphDoc {
  graphId: GraphId;
  /** Canonical node order for progress display (optional in older bundles). */
  loop?: string[];
  entryPoints: Record<string, string>;
  nodes: Record<string, GraphNodeDef>;
}

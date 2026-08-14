import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { substituteConfig, type VindicateConfig } from "./config-substitutor.js";
import { resolveContentRoot } from "./content-path.js";
import type {
  GetNodeInput,
  GraphId,
  IContentService,
  NodeView,
  PathEntry,
  WorkflowMap
} from "./content-service.interface.js";
import type { GraphDoc } from "./graph-types.js";
import {
  buildSoftWarning,
  extractEntryRouting,
  extractMermaid,
  parseFrontmatter,
  sliceNodeByMode,
  sliceSetupByMode
} from "./markdown-utils.js";

const SETUP_PATHS = new Set(["bootstrap", "ci"]);
const MAIN_PATHS = new Set([
  "write",
  "fix",
  "flaky",
  "refactor",
  "gaps",
  "coverage",
  "smoke",
  "requirements"
]);

const PICK_ENTRY =
  "State your path (write · fix · flaky · refactor · gaps · coverage · smoke · requirements · bootstrap · ci) " +
  "so the map routes you to the right entry node.";

export interface ContentServiceDeps {
  readonly projectRoot: string;
  readonly contentRoot?: string;
}

interface LoadedNode {
  graphId: GraphId;
  frontmatter: ReturnType<typeof parseFrontmatter>["frontmatter"];
  body: string;
  refs: string[];
  modeRefs: Record<string, string[]>;
}

const WORKFLOW_PROGRESS_REF = "ref-workflow-progress";

export class ContentService implements IContentService {
  private readonly contentRoot: string;
  private readonly projectRoot: string;
  private readonly graphs = new Map<GraphId, GraphDoc>();
  private readonly mapViews = new Map<GraphId, WorkflowMap>();
  private readonly nodes = new Map<string, LoadedNode>();
  private readonly refs = new Map<string, string>();
  private configCache: VindicateConfig | null | undefined;

  constructor(deps: ContentServiceDeps) {
    this.projectRoot = deps.projectRoot;
    this.contentRoot = deps.contentRoot ?? resolveContentRoot(import.meta.dirname);
    this.loadBundle();
  }

  getMap(path?: string): WorkflowMap {
    const graphId = this.resolveGraphId(path);
    const map = this.mapViews.get(graphId);
    if (map === undefined) {
      throw new Error(`Unknown graph: ${graphId}`);
    }
    return map;
  }

  getGraph(graphId: GraphId): GraphDoc {
    const graph = this.graphs.get(graphId);
    if (graph === undefined) {
      throw new Error(`Unknown graph: ${graphId}`);
    }
    return graph;
  }

  resolvePathEntry(path: string): PathEntry | undefined {
    if (!this.isPathKnown(path)) {
      return undefined;
    }
    const graphId = this.resolveGraphId(path);
    const graph = this.graphs.get(graphId);
    const nodeId = graph?.entryPoints[path];
    if (graph === undefined || nodeId === undefined) {
      return undefined;
    }
    return { graphId, nodeId };
  }

  getNode(input: GetNodeInput): NodeView {
    const loaded = this.nodes.get(input.node);
    if (loaded === undefined) {
      throw new Error(`Unknown node: ${input.node}`);
    }
    const graph = this.graphs.get(loaded.graphId);
    const nodeDef = graph?.nodes[input.node];
    if (graph === undefined || nodeDef === undefined) {
      throw new Error(`Unknown node: ${input.node}`);
    }

    let markdown = this.renderNodeBody(loaded, input.mode);
    let softWarning: string | undefined;
    if (input.from !== undefined && input.from.length > 0) {
      const fromDef = graph.nodes[input.from];
      if (fromDef !== undefined) {
        softWarning = buildSoftWarning(input.from, input.node, fromDef.edges);
        if (softWarning !== undefined) {
          markdown = `${softWarning}\n\n${markdown}`;
        }
      }
    }

    const edgeSuffix =
      nodeDef.edges.length > 0
        ? `\n\n## Next\n${nodeDef.edges.map((e) => `- **${e.to}** — ${e.when}`).join("\n")}`
        : "";

    return {
      node: input.node,
      markdown: markdown + edgeSuffix,
      outgoingEdges: nodeDef.edges,
      terminal: nodeDef.terminal,
      ...(softWarning !== undefined ? { softWarning } : {})
    };
  }

  getSetupSkill(mode: "bootstrap" | "ci"): NodeView {
    const loaded = this.nodes.get("setup");
    if (loaded === undefined) {
      throw new Error("Setup skill content is missing from the bundle");
    }
    const graph = this.graphs.get("setup");
    const nodeDef = graph?.nodes["setup"];
    let body = sliceSetupByMode(loaded.body, mode);
    body = this.substitute(body);
    for (const ref of loaded.refs) {
      const refBody = this.refs.get(ref);
      if (refBody !== undefined) {
        body += `\n\n---\n\n## ${ref}\n\n${this.substitute(refBody)}`;
      }
    }
    return {
      node: "setup",
      markdown: body,
      outgoingEdges: nodeDef?.edges ?? [],
      terminal: nodeDef?.terminal ?? false
    };
  }

  listNodeIds(graphId?: GraphId): string[] {
    if (graphId !== undefined) {
      const graph = this.graphs.get(graphId);
      return graph !== undefined ? Object.keys(graph.nodes) : [];
    }
    return [...this.nodes.keys()];
  }

  getWorkflowProgressGuide(): string {
    const raw = this.refs.get(WORKFLOW_PROGRESS_REF);
    if (raw === undefined) {
      return "";
    }
    return this.substitute(parseFrontmatter(raw).body);
  }

  private resolveGraphId(path?: string): GraphId {
    if (path !== undefined && SETUP_PATHS.has(path)) {
      return "setup";
    }
    return "main";
  }

  private renderNodeBody(loaded: LoadedNode, mode?: string): string {
    let body = sliceNodeByMode(loaded.body, mode);
    body = this.substitute(body);
    for (const ref of this.refsForMode(loaded, mode)) {
      const refBody = this.refs.get(ref);
      if (refBody !== undefined) {
        body += `\n\n---\n\n## ${ref}\n\n${this.substitute(refBody)}`;
      }
    }
    return body;
  }

  /**
   * Refs to append for a node render. The shared `refs` are always included; a
   * specific `mode` adds only that mode's extra refs, while a mode-less render
   * (mode undefined) includes every mode's refs so the full node is served.
   * Order is preserved (shared first) and duplicates are dropped.
   */
  private refsForMode(loaded: LoadedNode, mode?: string): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const add = (refs: readonly string[]): void => {
      for (const ref of refs) {
        if (!seen.has(ref)) {
          seen.add(ref);
          ordered.push(ref);
        }
      }
    };
    add(loaded.refs);
    if (mode !== undefined && mode.length > 0) {
      add(loaded.modeRefs[mode] ?? []);
    } else {
      for (const refs of Object.values(loaded.modeRefs)) {
        add(refs);
      }
    }
    return ordered;
  }

  private substitute(text: string): string {
    return substituteConfig(text, this.readProjectConfig());
  }

  private readProjectConfig(): VindicateConfig {
    if (this.configCache !== undefined) {
      return this.configCache ?? {};
    }
    const configPath = path.join(this.projectRoot, ".vindicate", "config.json");
    if (!existsSync(configPath)) {
      this.configCache = null;
      return {};
    }
    try {
      const raw = readFileSync(configPath, "utf8");
      this.configCache = JSON.parse(raw) as VindicateConfig;
      return this.configCache;
    } catch {
      this.configCache = null;
      return {};
    }
  }

  private loadBundle(): void {
    const graphsDir = path.join(this.contentRoot, "graphs");
    const nodesDir = path.join(this.contentRoot, "nodes");
    const refsDir = path.join(this.contentRoot, "refs");

    for (const file of readdirSync(refsDir).filter((f) => f.endsWith(".md"))) {
      const key = file.replace(/\.md$/, "");
      this.refs.set(key, readFileSync(path.join(refsDir, file), "utf8"));
    }

    for (const file of readdirSync(graphsDir).filter((f) => f.endsWith(".graph.json"))) {
      const doc = JSON.parse(readFileSync(path.join(graphsDir, file), "utf8")) as GraphDoc;
      this.graphs.set(doc.graphId, doc);
      const mdFile = path.join(graphsDir, `${doc.graphId}.graph.md`);
      const md = readFileSync(mdFile, "utf8");
      this.mapViews.set(doc.graphId, {
        graphId: doc.graphId,
        mermaid: extractMermaid(md),
        entryRouting: extractEntryRouting(md),
        pickEntry: PICK_ENTRY
      });
    }

    for (const file of readdirSync(nodesDir).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(path.join(nodesDir, file), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const nodeId = frontmatter?.node ?? file.replace(/\.md$/, "");
      const graphId = (frontmatter?.graph ?? "main") as GraphId;
      const refs = frontmatter?.refs ?? [];
      const modeRefs = frontmatter?.modeRefs ?? {};
      this.nodes.set(nodeId, { graphId, frontmatter, body, refs, modeRefs });
    }
  }

  /** @internal test hook */
  isPathKnown(path: string): boolean {
    return SETUP_PATHS.has(path) || MAIN_PATHS.has(path);
  }
}

export { SETUP_PATHS, MAIN_PATHS };

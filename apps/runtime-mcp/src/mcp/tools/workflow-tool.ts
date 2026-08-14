/**
 * @file vindicate_workflow — stateless map, phase guidance, and progress panel payload.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import type { IContentService, NodeView } from "../../content/content-service.interface.js";
import { MAIN_PATHS, SETUP_PATHS } from "../../content/content-service.js";
import { WorkflowContentError } from "../../shared/errors.js";
import { buildProgressDisplay, checkAppsCapability } from "../apps-capability.js";
import { APP_RESOURCE_URI } from "../resources/vindicate-app-resource.js";
import {
  buildProgressEcho,
  buildWorkflowPhases,
  suggestNextWorkflowCall
} from "../panels/workflow-phases.js";
import { formatWorkflowProgressMarkdown } from "../panels/workflow-progress-markdown.js";
import { toMcpToolError } from "./error-mapper.js";
import { toolJson } from "./result.js";

const PATH_SCHEMA = z
  .enum([
    "write",
    "fix",
    "flaky",
    "refactor",
    "gaps",
    "coverage",
    "smoke",
    "requirements",
    "bootstrap",
    "ci"
  ])
  .optional();

function formatMapMarkdown(map: ReturnType<IContentService["getMap"]>): string {
  const routing =
    map.entryRouting.length > 0
      ? map.entryRouting.map((r) => `| \`${r.path}\` | \`${r.node}\` | ${r.why} |`).join("\n")
      : "";
  const parts = [
    `# Workflow map (${map.graphId})`,
    map.pickEntry !== undefined ? map.pickEntry : "",
    "```mermaid",
    map.mermaid,
    "```",
    routing.length > 0
      ? `## Entry routing\n\n| Path | Entry node | Why |\n|------|-----------|-----|\n${routing}`
      : ""
  ];
  return parts.filter((p) => p.length > 0).join("\n\n");
}

function isSetupPath(path: string | undefined): path is "bootstrap" | "ci" {
  return path === "bootstrap" || path === "ci";
}

function listValidNodes(contentService: IContentService): string {
  const main = contentService.listNodeIds("main").sort();
  const setup = contentService.listNodeIds("setup").sort();
  return [...main, ...setup.filter((n) => !main.includes(n))].join(", ");
}

function unknownPathError(path: string, contentService: IContentService): WorkflowContentError {
  const valid = [...MAIN_PATHS, ...SETUP_PATHS].join(", ");
  return new WorkflowContentError(
    `Unknown workflow path "${path}". Valid paths: ${valid}.\n\nValid nodes: ${listValidNodes(contentService)}`
  );
}

function unknownNodeError(node: string, contentService: IContentService): WorkflowContentError {
  const map = formatMapMarkdown(contentService.getMap());
  return new WorkflowContentError(
    `Unknown workflow node "${node}".\n\nValid nodes: ${listValidNodes(contentService)}.\n\n${map}`
  );
}

const PATH_WHEN_PREFIX = /^path\s*={2,3}\s*['"]?(\w+)['"]?\s*(?:[—–-]\s*)?/i;

function pathFromWhen(when: string): string | undefined {
  return when.match(PATH_WHEN_PREFIX)?.[1];
}

function humanizeWhen(when: string): string {
  const stripped = when.replace(PATH_WHEN_PREFIX, "").trim();
  return stripped.length > 0 ? stripped : when;
}

/** Outgoing done-conditions for the agent; path-tagged edges are filtered to the active path. */
function doneChecklist(nodeView: NodeView, path: string): string[] {
  const whens = nodeView.outgoingEdges.map((e) => e.when).filter((w) => w.length > 0);
  const hasPathTagged = whens.some((w) => pathFromWhen(w) !== undefined);
  if (!hasPathTagged) {
    return whens;
  }
  return whens.filter((w) => pathFromWhen(w) === path).map(humanizeWhen);
}

function resolveEffectiveCompleted(
  path: string,
  activeNode: string | undefined,
  completed: string[] | undefined,
  contentService: IContentService
): string[] {
  if (completed !== undefined && completed.length > 0) {
    return completed;
  }
  if (activeNode === undefined) {
    return [];
  }
  const entry = contentService.resolvePathEntry(path);
  if (entry === undefined) {
    return [];
  }
  const graph = contentService.getGraph(entry.graphId);
  const { phases } = buildWorkflowPhases({ graph, path, activeNode });
  return phases.filter((p) => p.status === "done").map((p) => p.id);
}

function appendWorkflowRefToInstructions(
  instructionsBody: string,
  contentService: IContentService
): string {
  const guide = contentService.getWorkflowProgressGuide();
  if (guide.length === 0) {
    return instructionsBody;
  }
  return `${instructionsBody}\n\n---\n\n${guide}`;
}

function shouldAppendWorkflowRef(input: {
  path?: string;
  node?: string;
  completed?: readonly string[];
  contentService: IContentService;
}): boolean {
  if (input.path === undefined) {
    return true;
  }
  const entry = input.contentService.resolvePathEntry(input.path);
  if (entry === undefined) {
    return false;
  }
  const activeNode = input.node ?? entry.nodeId;
  if (activeNode !== entry.nodeId) {
    return false;
  }
  return input.completed === undefined || input.completed.length === 0;
}

function appendProgressFields(
  payload: Record<string, unknown>,
  markdownPanel: string,
  appsPanelSupported: boolean
): void {
  payload.progress_display = buildProgressDisplay(appsPanelSupported);
  if (!appsPanelSupported) {
    payload.markdown_panel = markdownPanel;
  }
}

function buildWorkflowPayload(input: {
  contentService: IContentService;
  path?: string;
  node?: string;
  from?: string;
  mode?: string;
  completed?: string[];
  instructionsBody: string;
  softWarning?: string;
  nodeView?: NodeView;
  appsPanelSupported: boolean;
}): Record<string, unknown> {
  const { contentService, path, node, softWarning, nodeView, appsPanelSupported } = input;
  const phaseInstructions = shouldAppendWorkflowRef({
    ...(path !== undefined ? { path } : {}),
    ...(node !== undefined ? { node } : {}),
    ...(input.completed !== undefined ? { completed: input.completed } : {}),
    contentService
  })
    ? appendWorkflowRefToInstructions(input.instructionsBody, contentService)
    : input.instructionsBody;

  if (path === undefined) {
    const markdownPanel = formatWorkflowProgressMarkdown({
      phaseLabel: "Choose a path",
      phases: [],
      nextCall: "Call vindicate_workflow(path:\"write\"|\"fix\"|…, node:<entry>, completed:[])."
    });
    const payload: Record<string, unknown> = {
      view: "workflow-progress",
      status: "orient",
      phase_instructions: phaseInstructions,
      agent_directives: {
        start:
          "Pick path from phase_instructions, then call vindicate_workflow(path, node:<entry>, completed:[]). Copy progress_echo forward."
      }
    };
    appendProgressFields(payload, markdownPanel, appsPanelSupported);
    return payload;
  }

  const entry = contentService.resolvePathEntry(path);
  if (entry === undefined) {
    throw unknownPathError(path, contentService);
  }

  const graph = contentService.getGraph(entry.graphId);
  const activeNode = node ?? entry.nodeId;
  const effectiveCompleted = resolveEffectiveCompleted(path, activeNode, input.completed, contentService);

  const { phases, warnings } = buildWorkflowPhases({
    graph,
    path,
    activeNode,
    completed: effectiveCompleted
  });

  const allWarnings = [...warnings];
  if (softWarning !== undefined) {
    allWarnings.unshift(softWarning.replace(/^⚠\s*/, ""));
  }

  const activePhase = phases.find((p) => p.status === "active");
  const phaseLabel = activePhase?.label ?? graph.nodes[activeNode]?.label ?? activeNode;
  const spineComplete = phases.length > 0 && phases.every((p) => p.status === "done");

  const progressEcho = buildProgressEcho({
    path,
    node: activeNode,
    completed: effectiveCompleted
  });

  const nextCall =
    nodeView !== undefined
      ? suggestNextWorkflowCall({ path, nodeView, completed: effectiveCompleted })
      : undefined;
  const doneBeforeLeave = nodeView !== undefined ? doneChecklist(nodeView, path) : [];

  const markdownPanel = formatWorkflowProgressMarkdown({
    phaseLabel,
    phases,
    ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
    ...(nextCall !== undefined ? { nextCall } : {}),
    ...(spineComplete ? { terminal: true } : {})
  });

  const payload: Record<string, unknown> = {
    view: "workflow-progress",
    path,
    phase: activeNode,
    phase_label: phaseLabel,
    phases,
    phase_instructions: phaseInstructions,
    progress_echo: progressEcho,
    agent_directives: {
      copy_forward: "Call vindicate_workflow with progress_echo.path, node, and completed.",
      ...(doneBeforeLeave.length > 0 ? { done_before_leave: doneBeforeLeave } : {}),
      ...(nextCall !== undefined ? { next_when_ready: nextCall } : {})
    }
  };

  appendProgressFields(payload, markdownPanel, appsPanelSupported);

  if (allWarnings.length > 0) {
    payload.warnings = allWarnings;
  }
  if (spineComplete) {
    payload.terminal = true;
  }

  return payload;
}

export function registerWorkflowTool(server: McpServer, contentService: IContentService): void {
  registerAppTool(
    server,
    "vindicate_workflow",
    {
      description:
        "Workflow map + phase steps with progress panel. Pass path once started; each phase: node, from, completed[]. " +
        "Copy progress_echo forward. Returns phase_instructions + progress_display; follow progress_display.instruction.",
      inputSchema: {
        path: PATH_SCHEMA,
        node: z.string().min(1).optional(),
        from: z.string().min(1).optional(),
        completed: z.array(z.string().min(1)).optional(),
        mode: z.string().min(1).optional()
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI } }
    },
    (args) => {
      const appsPanelSupported = checkAppsCapability(server);
      try {
        if (args.path !== undefined) {
          const known = MAIN_PATHS.has(args.path) || SETUP_PATHS.has(args.path);
          if (!known) {
            return toMcpToolError(unknownPathError(args.path, contentService));
          }
        }

        if (args.node === undefined) {
          if (isSetupPath(args.path)) {
            const skill = contentService.getSetupSkill(args.path);
            const payload = buildWorkflowPayload({
              contentService,
              path: args.path,
              instructionsBody: skill.markdown,
              nodeView: skill,
              appsPanelSupported
            });
            return toolJson(payload, "vindicate_workflow", { compact: true });
          }
          const map = contentService.getMap(args.path);
          const mapMd = formatMapMarkdown(map);
          if (args.path !== undefined) {
            const entry = contentService.resolvePathEntry(args.path);
            if (entry === undefined) {
              return toMcpToolError(unknownPathError(args.path, contentService));
            }
            const nodeView = contentService.getNode({ node: entry.nodeId });
            const payload = buildWorkflowPayload({
              contentService,
              path: args.path,
              node: entry.nodeId,
              instructionsBody: mapMd,
              nodeView,
              appsPanelSupported
            });
            return toolJson(payload, "vindicate_workflow", { compact: true });
          }
          const payload = buildWorkflowPayload({
            contentService,
            instructionsBody: mapMd,
            appsPanelSupported
          });
          return toolJson(payload, "vindicate_workflow", { compact: true });
        }

        if (args.node !== undefined && args.path === undefined) {
          return toMcpToolError(
            new WorkflowContentError(
              "vindicate_workflow requires path when node is set — pass path (write, fix, …) and copy progress_echo from the prior response."
            )
          );
        }

        if (isSetupPath(args.path) || args.node === "setup") {
          const mode = isSetupPath(args.path) ? args.path : "bootstrap";
          const skill = contentService.getSetupSkill(mode);
          const payload = buildWorkflowPayload({
            contentService,
            path: args.path ?? mode,
            node: args.node,
            ...(args.completed !== undefined ? { completed: args.completed } : {}),
            instructionsBody: skill.markdown,
            nodeView: skill,
            appsPanelSupported
          });
          return toolJson(payload, "vindicate_workflow", { compact: true });
        }

        try {
          const nodeView = contentService.getNode({
            node: args.node,
            ...(args.from !== undefined ? { from: args.from } : {}),
            ...(args.mode !== undefined ? { mode: args.mode } : {})
          });
          const payload = buildWorkflowPayload({
            contentService,
            path: args.path!,
            node: args.node,
            ...(args.from !== undefined ? { from: args.from } : {}),
            ...(args.mode !== undefined ? { mode: args.mode } : {}),
            ...(args.completed !== undefined ? { completed: args.completed } : {}),
            instructionsBody: nodeView.markdown,
            ...(nodeView.softWarning !== undefined ? { softWarning: nodeView.softWarning } : {}),
            nodeView,
            appsPanelSupported
          });
          return toolJson(payload, "vindicate_workflow", { compact: true });
        } catch (err: unknown) {
          if (err instanceof Error && err.message.startsWith("Unknown node:")) {
            return toMcpToolError(unknownNodeError(args.node, contentService));
          }
          throw err;
        }
      } catch (err: unknown) {
        return toMcpToolError(err);
      }
    }
  );
}

#!/usr/bin/env node
/**
 * Build-time validator for the bundled workflow content.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter } from "../src/content/markdown-utils.js";
import {
  validateGraphStructure,
  validateNodeRefs,
  validateNodeTools,
  validateUnsubstitutedVars
} from "../src/content/validate-content-lib.js";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const refsDir = path.join(contentRoot, "refs");
  const availableRefs = new Set(
    readdirSync(refsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
  );

  const graphsDir = path.join(contentRoot, "graphs");
  const graphFiles = readdirSync(graphsDir).filter((f) => f.endsWith(".graph.json"));

  const nodesDir = path.join(contentRoot, "nodes");
  const allNodes = readdirSync(nodesDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(path.join(nodesDir, file), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const modeRefs = frontmatter?.modeRefs ?? {};
      return {
        nodeId: frontmatter?.node ?? file.replace(/\.md$/, ""),
        graphId: frontmatter?.graph ?? "main",
        // Validate the union of shared refs and every mode's extra refs so a
        // missing per-mode ref (e.g. refs.create) is still caught.
        refs: [...(frontmatter?.refs ?? []), ...Object.values(modeRefs).flat()],
        body
      };
    });

  for (const graphFile of graphFiles) {
    const graph = JSON.parse(readFileSync(path.join(graphsDir, graphFile), "utf8")) as {
      graphId: string;
      entryPoints: Record<string, string>;
      nodes: Record<string, { terminal: boolean; edges: Array<{ to: string; when: string }> }>;
    };
    const graphResult = validateGraphStructure(graph);
    errors.push(...graphResult.errors);
    warnings.push(...graphResult.warnings);

    const graphNodes = allNodes.filter((n) => n.graphId === graph.graphId);
    errors.push(...validateNodeRefs(graphNodes, availableRefs));
    errors.push(...validateNodeTools(graphNodes));
  }

  for (const ref of availableRefs) {
    const text = readFileSync(path.join(refsDir, `${ref}.md`), "utf8");
    warnings.push(...validateUnsubstitutedVars(text, `refs/${ref}.md`));
  }
  for (const node of allNodes) {
    warnings.push(...validateUnsubstitutedVars(node.body, `nodes/${node.nodeId}.md`));
  }

  if (warnings.length > 0) {
    console.warn("Content validation warnings:");
    for (const w of warnings) {
      console.warn(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    console.error("Content validation failed:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(`Content validation passed (${graphFiles.length} graphs, ${allNodes.length} nodes).`);
}

main();

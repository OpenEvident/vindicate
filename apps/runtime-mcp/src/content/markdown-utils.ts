export interface NodeFrontmatter {
  node: string;
  graph: string;
  refs: string[];
  modes: string[];
  /**
   * Extra refs appended only when a given mode is active, keyed by mode name.
   * Declared in frontmatter as `refs.<mode>: [ref-a, ref-b]`. The shared `refs`
   * list is always appended; `modeRefs[mode]` is added on top for that mode.
   */
  modeRefs: Record<string, string[]>;
}

export function parseFrontmatter(raw: string): { frontmatter: NodeFrontmatter | null; body: string } {
  // Normalize CRLF up front — content files are hand-edited across OSes (this repo
  // has no .gitattributes forcing LF), and every boundary check below is a bare
  // "\n" match that silently returns frontmatter: null on CRLF input, dropping
  // that node's refs/modeRefs/graph with no error.
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: null, body: normalized };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    return { frontmatter: null, body: normalized };
  }
  const yamlBlock = normalized.slice(4, end);
  const body = normalized.slice(end + 5);
  const frontmatter = parseYamlFrontmatter(yamlBlock);
  return { frontmatter, body };
}

function parseYamlFrontmatter(yaml: string): NodeFrontmatter | null {
  const lines = yaml.split("\n");
  const map: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const node = map["node"];
  const graph = map["graph"];
  if (node === undefined || graph === undefined) {
    return null;
  }
  const modeRefs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith("refs.")) {
      continue;
    }
    const mode = key.slice("refs.".length).trim();
    if (mode.length > 0) {
      modeRefs[mode] = parseList(value);
    }
  }
  return {
    node,
    graph,
    refs: parseList(map["refs"]),
    modes: parseList(map["modes"]),
    modeRefs
  };
}

function parseList(value: string | undefined): string[] {
  if (value === undefined || value.length === 0) {
    return [];
  }
  const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function extractMermaid(markdown: string): string {
  const match = markdown.match(/```mermaid\r?\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? "";
}

export function extractEntryRouting(
  markdown: string
): { path: string; node: string; why: string }[] {
  const sectionIdx = markdown.indexOf("## Entry routing");
  if (sectionIdx < 0) {
    return [];
  }
  const after = markdown.slice(sectionIdx);
  const lines = after.split("\n");
  const rows: { path: string; node: string; why: string }[] = [];
  for (const line of lines) {
    if (!line.startsWith("|") || line.includes("Path") || line.includes("---")) {
      continue;
    }
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 3) continue;
    const pathCell = cells[0]!.replace(/`/g, "");
    const nodeCell = cells[1]!.replace(/`/g, "");
    const why = cells[2]!;
    rows.push({ path: pathCell, node: nodeCell, why });
  }
  return rows;
}

export function sliceNodeByMode(body: string, mode: string | undefined): string {
  if (mode === undefined || mode.length === 0) {
    return body;
  }
  const marker = "## Mode slices";
  const idx = body.indexOf(marker);
  if (idx < 0) {
    return body;
  }
  const before = body.slice(0, idx).trimEnd();
  const rest = body.slice(idx + marker.length);
  const tailMatch = rest.match(/\n## (?!#)/);
  const modeBlock = tailMatch ? rest.slice(0, tailMatch.index) : rest;
  const tail = tailMatch ? rest.slice(tailMatch.index! + 1).trim() : "";

  let selected = "";
  for (const sec of modeBlock.split(/\n(?=### )/)) {
    const trimmed = sec.trim();
    if (!trimmed.startsWith("### ")) {
      continue;
    }
    const heading = trimmed.slice(4).split("\n")[0] ?? "";
    if (headingMatchesMode(heading, mode)) {
      selected = trimmed;
      break;
    }
  }

  return [before, selected, tail].filter((part) => part.length > 0).join("\n\n");
}

export function sliceSetupByMode(body: string, mode: "bootstrap" | "ci"): string {
  if (mode === "bootstrap") {
    return body;
  }
  const stepsIdx = body.indexOf("## Steps");
  if (stepsIdx < 0) {
    return body;
  }
  const before = body.slice(0, stepsIdx).trimEnd();
  const stepsBlock = body.slice(stepsIdx);
  const afterStepsIdx = stepsBlock.search(/\n## (?!Steps)/);
  const stepsOnly = afterStepsIdx >= 0 ? stepsBlock.slice(0, afterStepsIdx) : stepsBlock;
  const after = afterStepsIdx >= 0 ? stepsBlock.slice(afterStepsIdx).trim() : "";
  const ciLine = stepsOnly
    .split("\n")
    .find((line) => line.includes("Mode `ci`") || line.includes("**Mode `ci`**"));
  const trimmedSteps =
    ciLine !== undefined
      ? `## Steps\n\n${ciLine.trim()}`
      : "## Steps\n\nRun the CI step only on an existing project.";
  return [before, trimmedSteps, after].filter((p) => p.length > 0).join("\n\n");
}

function headingMatchesMode(heading: string, mode: string): boolean {
  const slug = heading.trim().split(/\s+/)[0] ?? "";
  return slug === mode || heading.trim().startsWith(`${mode} `) || heading.trim().startsWith(`${mode}(`);
}

export function buildSoftWarning(
  from: string,
  node: string,
  edges: { to: string; when: string }[]
): string | undefined {
  if (edges.some((e) => e.to === node)) {
    return undefined;
  }
  const usual = edges.map((e) => e.to).join(", ");
  return `⚠ unusual transition from ${from}; usual next: ${usual}`;
}

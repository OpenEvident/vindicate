import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ContentService } from "../../src/content/content-service.js";
import { resolveContentRoot } from "../../src/content/content-path.js";
import {
  buildSoftWarning,
  parseFrontmatter,
  sliceNodeByMode
} from "../../src/content/markdown-utils.js";

describe("ContentService", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  function service(projectRoot?: string): ContentService {
    const root =
      projectRoot ?? path.join(os.tmpdir(), `vindicate-content-${Date.now()}-${Math.random()}`);
    if (projectRoot === undefined) {
      dirs.push(root);
    }
    return new ContentService({
      projectRoot: root,
      contentRoot: resolveContentRoot(path.join(import.meta.dirname, "../../src/content"))
    });
  }

  it("returns main map with mermaid and entry routing", () => {
    const svc = service();
    const map = svc.getMap();
    expect(map.graphId).toBe("main");
    expect(map.mermaid).toContain("flowchart");
    expect(map.entryRouting.some((r) => r.path === "write" && r.node === "understand")).toBe(true);
    expect(map.entryRouting.some((r) => r.path === "requirements" && r.node === "requirements")).toBe(
      true
    );
    expect(map.pickEntry).toContain("write");
    expect(map.pickEntry).toContain("requirements");
  });

  it("serves the requirements node with ref-requirements appended", () => {
    const svc = service();
    const entry = svc.resolvePathEntry("requirements");
    expect(entry).toEqual({ graphId: "main", nodeId: "requirements" });
    const view = svc.getNode({ node: "requirements" });
    expect(view.node).toBe("requirements");
    expect(view.terminal).toBe(true);
    expect(view.outgoingEdges).toEqual([]);
    expect(view.markdown).toContain("# Requirements");
    expect(view.markdown).toContain("## ref-requirements");
    expect(view.markdown).toContain("Never call `vindicate_generate_code`");
  });

  it("returns setup map when path is bootstrap", () => {
    const svc = service();
    const map = svc.getMap("bootstrap");
    expect(map.graphId).toBe("setup");
    expect(map.entryRouting.some((r) => r.path === "bootstrap")).toBe(true);
  });

  it("returns node body with refs appended in order", async () => {
    const svc = service();
    const view = svc.getNode({ node: "ground" });
    expect(view.node).toBe("ground");
    expect(view.markdown).toContain("# Ground");
    expect(view.markdown).toContain("## ref-page-object");
    expect(view.markdown).toContain("## ref-memory");
    const pageIdx = view.markdown.indexOf("ref-page-object");
    const memoryIdx = view.markdown.indexOf("ref-memory");
    expect(pageIdx).toBeGreaterThan(0);
    expect(memoryIdx).toBeGreaterThan(pageIdx);
    expect(view.outgoingEdges.length).toBeGreaterThan(0);
  });

  it("strips frontmatter from served markdown", () => {
    const svc = service();
    const view = svc.getNode({ node: "ground" });
    expect(view.markdown).not.toContain("---\nnode: ground");
  });

  it("mode-slices heal node content", () => {
    const svc = service();
    const flaky = svc.getNode({ node: "heal", mode: "flaky-triage" });
    expect(flaky.markdown).toContain("flaky-triage");
    expect(flaky.markdown).not.toContain("failure-triage (fix path");
    const failure = svc.getNode({ node: "heal", mode: "failure-triage" });
    expect(failure.markdown).toContain("failure-triage");
    expect(failure.markdown).not.toContain("intermittency");
  });

  it("scopes generate refs by mode (direct-edit drops the codegen schema)", () => {
    const svc = service();
    const directEdit = svc.getNode({ node: "generate", mode: "direct-edit" });
    expect(directEdit.markdown).toContain("## ref-page-object");
    expect(directEdit.markdown).toContain("## ref-contract");
    expect(directEdit.markdown).not.toContain("## ref-codegen-schema");

    const create = svc.getNode({ node: "generate", mode: "create" });
    expect(create.markdown).toContain("## ref-codegen-schema");
    expect(create.markdown).toContain("## ref-page-object");
  });

  it("serves every generate ref when no mode is given", () => {
    const svc = service();
    const all = svc.getNode({ node: "generate" });
    expect(all.markdown).toContain("## ref-codegen-schema");
    expect(all.markdown).toContain("## ref-page-object");
    expect(all.markdown).toContain("## ref-contract");
    expect(all.markdown).toContain("## ref-recipes");
  });

  it("soft-warns on unusual from→to edge but still serves content", () => {
    const svc = service();
    const view = svc.getNode({ node: "audit", from: "ground" });
    expect(view.softWarning).toMatch(/unusual transition from ground/);
    expect(view.markdown).toContain("# Audit");
  });

  it("substitutes testIdAttribute from .vindicate/config.json", async () => {
    const root = path.join(os.tmpdir(), `vindicate-cfg-${Date.now()}`);
    dirs.push(root);
    await mkdir(path.join(root, ".vindicate"), { recursive: true });
    await writeFile(
      path.join(root, ".vindicate", "config.json"),
      JSON.stringify({ testIdAttribute: "data-qa" }),
      "utf8"
    );
    const refsRoot = resolveContentRoot(path.join(import.meta.dirname, "../../src/content"));
    const pageObject = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(refsRoot, "refs", "ref-page-object.md"), "utf8")
    );
    if (!pageObject.includes("{{testIdAttribute}}")) {
      const svc = service(root);
      expect(svc.getNode({ node: "ground" }).markdown.length).toBeGreaterThan(100);
      return;
    }
    const svc = new ContentService({ projectRoot: root, contentRoot: refsRoot });
    const view = svc.getNode({ node: "ground" });
    expect(view.markdown).toContain("data-qa");
  });

  it("returns setup skill for bootstrap vs ci", () => {
    const svc = service();
    const bootstrap = svc.getSetupSkill("bootstrap");
    expect(bootstrap.markdown).toContain("scaffold_project");
    expect(bootstrap.markdown).toContain("Mode `bootstrap`");
    const ci = svc.getSetupSkill("ci");
    expect(ci.markdown).toContain("Mode `ci`");
    expect(ci.markdown).not.toContain("Mode `bootstrap`");
  });

  it("throws for unknown node", () => {
    const svc = service();
    expect(() => svc.getNode({ node: "nonexistent-node" })).toThrow(/Unknown node/);
  });
});

describe("markdown-utils", () => {
  it("parseFrontmatter extracts refs list", () => {
    const raw = `---
node: ground
graph: main
refs: [ref-page-object, ref-memory]
---
# Body`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter?.refs).toEqual(["ref-page-object", "ref-memory"]);
    expect(body).toContain("# Body");
  });

  it("parseFrontmatter extracts per-mode refs into modeRefs", () => {
    const raw = `---
node: generate
graph: main
refs: [ref-page-object, ref-contract]
refs.create: [ref-codegen-schema]
refs.add_test_cases: [ref-codegen-schema]
modes: [create, direct-edit]
---
# Body`;
    const { frontmatter } = parseFrontmatter(raw);
    expect(frontmatter?.refs).toEqual(["ref-page-object", "ref-contract"]);
    expect(frontmatter?.modeRefs).toEqual({
      create: ["ref-codegen-schema"],
      add_test_cases: ["ref-codegen-schema"]
    });
  });

  it("sliceNodeByMode keeps shared tail sections", () => {
    const body = `## Goal
G

## Mode slices

### alpha
A

### beta
B

## Output
O`;
    const sliced = sliceNodeByMode(body, "beta");
    expect(sliced).toContain("## Goal");
    expect(sliced).toContain("B");
    expect(sliced).not.toContain("### alpha");
    expect(sliced).toContain("## Output");
  });

  it("buildSoftWarning lists usual edges", () => {
    const warning = buildSoftWarning("ground", "audit", [
      { to: "design", when: "write" },
      { to: "generate", when: "fix" }
    ]);
    expect(warning).toMatch(/design, generate/);
  });
});

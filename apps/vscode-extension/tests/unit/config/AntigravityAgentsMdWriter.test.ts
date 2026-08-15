import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AntigravityAgentsMdWriter } from "../../../src/extension/config/AntigravityAgentsMdWriter";
import {
  buildAgentsMdBlock,
  VINDICATE_AGENTS_MARKERS
} from "../../../src/extension/config/vindicateRuleContent";

describe("AntigravityAgentsMdWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-antigravity-agents-md");
  const agentsMdPath = path.join(root, ".agents", "AGENTS.md");
  const writer = new AntigravityAgentsMdWriter({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    show: vi.fn()
  });

  beforeEach(async () => {
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("isConfigured returns false when .agents/AGENTS.md doesn't exist at all", async () => {
    expect(await writer.isConfigured(root)).toBe(false);
  });

  it("isConfigured returns false when AGENTS.md exists but has no vindicate markers", async () => {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    await writeFile(agentsMdPath, "# Project\n", "utf8");
    expect(await writer.isConfigured(root)).toBe(false);
  });

  it("creates .agents/ and AGENTS.md when neither exists yet", async () => {
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    await expect(access(agentsMdPath)).resolves.toBeUndefined();
    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain(VINDICATE_AGENTS_MARKERS.start);
    expect(content).toContain("vindicate_workflow");
  });

  it("appends block without overwriting existing content when .agents/ already exists", async () => {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    await writeFile(agentsMdPath, "# Project\nExisting\n", "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(agentsMdPath, "utf8");
    expect(content.startsWith("# Project\nExisting\n")).toBe(true);
    expect(content).toContain(VINDICATE_AGENTS_MARKERS.start);
    expect(content).toContain("vindicate_workflow");
  });

  it("skips when markers already present", async () => {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    const block = buildAgentsMdBlock();
    await writeFile(agentsMdPath, block, "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
  });

  it("replaces existing vindicate block in place, leaving surrounding content untouched", async () => {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    const old = `${VINDICATE_AGENTS_MARKERS.start}\nold\n${VINDICATE_AGENTS_MARKERS.end}\n\n# Rest`;
    await writeFile(agentsMdPath, old, "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(agentsMdPath, "utf8");
    expect(content).toContain("vindicate_workflow");
    expect(content).toContain("# Rest");
    expect(content).not.toContain("\nold\n");
  });

  it("uses its own markers, independent of ClaudeMdWriter's — a file with only CLAUDE.md-style markers is not seen as configured", async () => {
    await mkdir(path.join(root, ".agents"), { recursive: true });
    // Text is identical to VINDICATE_CLAUDE_MARKERS by design, but isConfigured must not depend on
    // that coincidence — this is really asserting the writer works standalone, not cross-checking
    // against the other writer's export.
    await writeFile(
      agentsMdPath,
      "<!-- something-else:start -->\nunrelated\n<!-- something-else:end -->",
      "utf8"
    );
    expect(await writer.isConfigured(root)).toBe(false);
  });
});

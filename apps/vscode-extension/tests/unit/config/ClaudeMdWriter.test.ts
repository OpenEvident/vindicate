import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeMdWriter } from "../../../src/extension/config/ClaudeMdWriter";
import { buildClaudeMdBlock, VINDICATE_CLAUDE_MARKERS } from "../../../src/extension/config/vindicateRuleContent";

describe("ClaudeMdWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-claude-md");
  const writer = new ClaudeMdWriter({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    show: vi.fn()
  });

  beforeEach(async () => {
    await mkdirSafe(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("isConfigured returns false when no markers", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Project\n", "utf8");
    expect(await writer.isConfigured(root)).toBe(false);
  });

  it("appends block without overwriting existing content", async () => {
    await writeFile(path.join(root, "CLAUDE.md"), "# Project\nExisting\n", "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(path.join(root, "CLAUDE.md"), "utf8");
    expect(content.startsWith("# Project\nExisting\n")).toBe(true);
    expect(content).toContain(VINDICATE_CLAUDE_MARKERS.start);
    expect(content).toContain("vindicate_workflow");
  });

  it("skips when markers already present", async () => {
    const block = buildClaudeMdBlock();
    await writeFile(path.join(root, "CLAUDE.md"), block, "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
  });

  it("replaces existing vindicate block in place", async () => {
    const old = `${VINDICATE_CLAUDE_MARKERS.start}\nold\n${VINDICATE_CLAUDE_MARKERS.end}\n\n# Rest`;
    await writeFile(path.join(root, "CLAUDE.md"), old, "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(path.join(root, "CLAUDE.md"), "utf8");
    expect(content).toContain("vindicate_workflow");
    expect(content).toContain("# Rest");
    expect(content).not.toContain("\nold\n");
  });

  it("creates CLAUDE.md when missing", async () => {
    await writer.write(root);
    const content = await readFile(path.join(root, "CLAUDE.md"), "utf8");
    expect(content).toContain(VINDICATE_CLAUDE_MARKERS.start);
  });
});

async function mkdirSafe(dir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
}

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CursorRuleWriter } from "../../../src/extension/config/CursorRuleWriter";
import {
  buildCursorMdcBlock,
  VINDICATE_CURSOR_MARKERS
} from "../../../src/extension/config/vindicateRuleContent";

describe("CursorRuleWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-cursor-rule");
  const ruleFile = path.join(root, ".cursor", "rules", "vindicate.mdc");
  const writer = new CursorRuleWriter({
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

  it("isConfigured returns false when file missing", async () => {
    expect(await writer.isConfigured(root)).toBe(false);
  });

  it("creates the file with frontmatter and the marked block when missing", async () => {
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(ruleFile, "utf8");
    expect(content.startsWith("---\ndescription:")).toBe(true);
    expect(content).toContain("alwaysApply: true");
    expect(content).toContain(VINDICATE_CURSOR_MARKERS.start);
    expect(content).toContain("vindicate_workflow");
  });

  it("appends the block without overwriting existing content", async () => {
    await mkdir(path.dirname(ruleFile), { recursive: true });
    await writeFile(ruleFile, "# My own note\n", "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(ruleFile, "utf8");
    expect(content.startsWith("# My own note\n")).toBe(true);
    expect(content).toContain(VINDICATE_CURSOR_MARKERS.start);
    expect(content).toContain("vindicate_workflow");
  });

  it("skips when the block is already present", async () => {
    await mkdir(path.dirname(ruleFile), { recursive: true });
    await writeFile(ruleFile, buildCursorMdcBlock(), "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
  });

  it("replaces the existing vindicate block in place, preserving frontmatter and surrounding content", async () => {
    const old = `---\ndescription: old\nalwaysApply: true\n---\n\n${VINDICATE_CURSOR_MARKERS.start}\nold body\n${VINDICATE_CURSOR_MARKERS.end}\n\n# My own note`;
    await mkdir(path.dirname(ruleFile), { recursive: true });
    await writeFile(ruleFile, old, "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(ruleFile, "utf8");
    expect(content).toContain("vindicate_workflow");
    expect(content).toContain("# My own note");
    expect(content.startsWith("---\ndescription: old\nalwaysApply: true\n---")).toBe(true);
    expect(content).not.toContain("old body");
  });
});

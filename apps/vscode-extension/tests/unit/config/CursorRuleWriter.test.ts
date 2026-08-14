import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CursorRuleWriter } from "../../../src/extension/config/CursorRuleWriter";

describe("CursorRuleWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-cursor-rule");
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

  it("writes file when missing", async () => {
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const content = await readFile(path.join(root, ".cursor", "rules", "vindicate.mdc"), "utf8");
    expect(content).toContain("vindicate_workflow");
    expect(content).toContain("AC-<n>:");
  });

  it("overwrites when file already exists", async () => {
    const ruleFile = path.join(root, ".cursor", "rules", "vindicate.mdc");
    await mkdir(path.dirname(ruleFile), { recursive: true });
    await writeFile(ruleFile, "# stale\n", "utf8");
    const result = await writer.write(root);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
    const content = await readFile(ruleFile, "utf8");
    expect(content).toContain("vindicate_workflow");
    expect(content).toContain("[AC-n]");
    expect(content).not.toContain("# stale");
  });
});

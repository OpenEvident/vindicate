import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSkillWriter } from "../../../src/extension/config/AgentSkillWriter";

describe("AgentSkillWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-agent-skill");
  const extensionPath = path.join(process.cwd());
  const writer = new AgentSkillWriter(
    {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      show: vi.fn()
    },
    extensionPath
  );

  beforeEach(async () => {
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("isConfigured returns false when skill missing", async () => {
    expect(await writer.isConfigured(root, "cursor")).toBe(false);
  });

  it("writes Cursor skill and communication resource under the shared .agents/skills/ path", async () => {
    const result = await writer.write(root, "cursor");
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const skill = await readFile(
      path.join(root, ".agents", "skills", "vindicate", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("vindicate_workflow");
    expect(skill).toContain("name: vindicate");
    const comm = await readFile(
      path.join(root, ".agents", "skills", "vindicate", "communication.md"),
      "utf8"
    );
    expect(comm.length).toBeGreaterThan(20);
  });

  it("is idempotent when skill already present", async () => {
    const skillDir = path.join(root, ".agents", "skills", "vindicate");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "# stale\n", "utf8");
    const result = await writer.write(root, "cursor");
    expect(result).toEqual({ ok: true, alreadyPresent: true });
    const skill = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    expect(skill).toContain("vindicate_workflow");
    expect(skill).not.toContain("# stale");
  });

  it("writes Claude Code skill under its own .claude/skills/vindicate/ — the one tool that doesn't read .agents/skills/", async () => {
    const result = await writer.write(root, "claudeCode");
    expect(result.ok).toBe(true);
    const skill = await readFile(
      path.join(root, ".claude", "skills", "vindicate", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("vindicate_workflow");
  });

  it("writes Antigravity skill under .agents/skills/vindicate/ — confirmed workspace-scoped location per antigravity.google's skills docs", async () => {
    const result = await writer.write(root, "antigravity");
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const skill = await readFile(
      path.join(root, ".agents", "skills", "vindicate", "SKILL.md"),
      "utf8"
    );
    // Same bundled content as every other tool — no adaptation needed, frontmatter (name +
    // description) already matches what Antigravity's skill format requires.
    expect(skill).toContain("vindicate_workflow");
    expect(skill).toContain("name: vindicate");
    const comm = await readFile(
      path.join(root, ".agents", "skills", "vindicate", "communication.md"),
      "utf8"
    );
    expect(comm.length).toBeGreaterThan(20);
  });

  it("isConfigured detects an existing Antigravity skill file", async () => {
    expect(await writer.isConfigured(root, "antigravity")).toBe(false);
    await writer.write(root, "antigravity");
    expect(await writer.isConfigured(root, "antigravity")).toBe(true);
  });

  it("cursor, vscode, and antigravity resolve to the identical shared path — one write covers all three", async () => {
    await writer.write(root, "cursor");
    const sharedPath = path.join(root, ".agents", "skills", "vindicate", "SKILL.md");
    await access(sharedPath);
    expect(await writer.isConfigured(root, "vscode")).toBe(true);
    expect(await writer.isConfigured(root, "antigravity")).toBe(true);
  });
});

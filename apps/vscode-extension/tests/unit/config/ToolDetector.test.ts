import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ToolDetector } from "../../../src/extension/config/ToolDetector";

describe("ToolDetector", () => {
  const claudePath = path.join(homedir(), ".claude.json");
  let hadClaude = false;

  beforeEach(async () => {
    try {
      await access(claudePath);
      hadClaude = true;
    } catch {
      await mkdir(path.dirname(claudePath), { recursive: true });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(claudePath, "{}", "utf8");
    }
  });

  afterEach(async () => {
    if (!hadClaude) {
      await rm(claudePath, { force: true });
    }
  });

  it("detects cursor when appName includes cursor", async () => {
    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Cursor");
    const detected = await new ToolDetector().detect();
    expect(detected.cursor).toBe(true);
    expect(detected.vscodeNative).toBe(false);
  });

  it("detects vscodeNative when not in Cursor", async () => {
    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Visual Studio Code");
    const detected = await new ToolDetector().detect();
    expect(detected.cursor).toBe(false);
    expect(detected.vscodeNative).toBe(true);
  });

  it("detects claudeCode when ~/.claude.json exists", async () => {
    const detected = await new ToolDetector().detect();
    expect(detected.claudeCode).toBe(true);
  });

  it('detects antigravity when appName includes antigravity — live-confirmed appName is "Antigravity IDE"', async () => {
    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Antigravity IDE");
    const detected = await new ToolDetector().detect();
    expect(detected.antigravity).toBe(true);
  });

  it("does not mark vscodeNative when running inside Antigravity — it's a distinct fork, same as Cursor", async () => {
    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Antigravity IDE");
    const detected = await new ToolDetector().detect();
    expect(detected.vscodeNative).toBe(false);
  });

  it("does not detect antigravity for plain VS Code or Cursor", async () => {
    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Visual Studio Code");
    expect((await new ToolDetector().detect()).antigravity).toBe(false);

    vi.spyOn(vscode.env, "appName", "get").mockReturnValue("Cursor");
    expect((await new ToolDetector().detect()).antigravity).toBe(false);
  });
});

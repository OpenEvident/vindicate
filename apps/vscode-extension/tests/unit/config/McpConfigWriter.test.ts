import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpTarget } from "../../../src/extension/config/MCP_TARGETS";
import { McpConfigWriter } from "../../../src/extension/config/McpConfigWriter";

function target(format: "mcpServers" | "servers", fileName: string): McpTarget {
  const configPath = path.join(process.cwd(), "tests", "tmp-mcp", fileName);
  return {
    name: "Test",
    configPath,
    format,
    serverKey: "Vindicate",
    serverValue: { url: "http://127.0.0.1:9223/mcp" }
  };
}

describe("McpConfigWriter", () => {
  const root = path.join(process.cwd(), "tests", "tmp-mcp");
  const writer = new McpConfigWriter({
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

  it("writes to empty file with mcpServers format", async () => {
    const t = target("mcpServers", "cursor.json");
    const result = await writer.write(t);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(parsed.mcpServers.Vindicate).toBeDefined();
    expect(parsed.mcpServers.Vindicate.url).toBe("http://127.0.0.1:9223/mcp");
  });

  it("writes type:http for Claude Code target", async () => {
    const t: McpTarget = {
      name: "Claude Code",
      configPath: path.join(process.cwd(), "tests", "tmp-mcp", "claude-code.json"),
      format: "mcpServers",
      serverKey: "Vindicate",
      serverValue: { type: "http", url: "http://127.0.0.1:9223/mcp" }
    };
    await writer.write(t);
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      mcpServers: Record<string, { type: string; url: string }>;
    };
    expect(parsed.mcpServers.Vindicate?.type).toBe("http");
    expect(parsed.mcpServers.Vindicate?.url).toBe("http://127.0.0.1:9223/mcp");
  });

  it("merges without overwriting other entries", async () => {
    const t = target("mcpServers", "merge.json");
    await writeFile(t.configPath, JSON.stringify({ mcpServers: { Other: { url: "x" } } }), "utf8");
    await writer.write(t);
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers.Other).toBeDefined();
    expect(parsed.mcpServers.Vindicate).toBeDefined();
  });

  it("skips when Vindicate key already present", async () => {
    const t = target("mcpServers", "exists.json");
    await writeFile(
      t.configPath,
      JSON.stringify({ mcpServers: { Vindicate: { url: "http://127.0.0.1:9223/mcp" } } }),
      "utf8"
    );
    const result = await writer.write(t);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
  });

  it("overwrites malformed JSON as a fresh config", async () => {
    const t = target("mcpServers", "bad.json");
    await writeFile(t.configPath, "{bad", "utf8");
    const result = await writer.write(t);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers.Vindicate).toBeDefined();
  });

  it("handles servers format for VS Code", async () => {
    const t = target("servers", "vscode.json");
    const result = await writer.write(t);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      servers: Record<string, unknown>;
    };
    expect(parsed.servers.Vindicate).toBeDefined();
  });

  it("removes an existing Vindicate entry", async () => {
    const t = target("mcpServers", "remove.json");
    await writeFile(
      t.configPath,
      JSON.stringify({ mcpServers: { Vindicate: { url: "http://127.0.0.1:9223/mcp" }, Other: { url: "x" } } }),
      "utf8"
    );
    const result = await writer.remove(t);
    expect(result).toEqual({ ok: true, alreadyPresent: true });
    const parsed = JSON.parse(await readFile(t.configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(parsed.mcpServers.Vindicate).toBeUndefined();
    expect(parsed.mcpServers.Other).toBeDefined();
  });

  it("remove is a no-op when key is missing", async () => {
    const t = target("mcpServers", "missing.json");
    await writeFile(t.configPath, JSON.stringify({ mcpServers: { Other: { url: "x" } } }), "utf8");
    const result = await writer.remove(t);
    expect(result).toEqual({ ok: true, alreadyPresent: false });
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMcpTargets, buildProjectMcpTargets } from "../../../src/extension/config/MCP_TARGETS";

const HEADER = "x-vindicate-project-root";

describe("buildProjectMcpTargets", () => {
  const folder = path.join("/workspace", "mytestrepo");

  it("returns exactly 4 targets: VS Code, Cursor, Claude Code, Antigravity", () => {
    const targets = buildProjectMcpTargets(folder);
    expect(targets.map((t) => t.name)).toEqual(["VS Code", "Cursor", "Claude Code", "Antigravity"]);
  });

  it("stamps every url-based target with the workspace root (query string + header)", () => {
    const targets = buildProjectMcpTargets(folder).filter((t) => t.name !== "Antigravity");
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      const value = t.serverValue as { url: string; headers?: Record<string, string> };
      // Query string is the reliable channel (all clients forward the url);
      // the header is the secondary channel.
      expect(value.url).toContain(`project_root=${encodeURIComponent(folder)}`);
      expect(value.headers).toEqual({ [HEADER]: folder });
    }
  });

  it("keeps the http type field for VS Code and Claude Code entries", () => {
    const targets = buildProjectMcpTargets(folder);
    const http = targets.filter((t) => (t.serverValue as { type?: string }).type === "http");
    // VS Code + Claude Code use the typed http form; Cursor uses the legacy url form.
    expect(http).toHaveLength(2);
  });

  describe("Antigravity target", () => {
    const target = buildProjectMcpTargets(folder).find((t) => t.name === "Antigravity")!;

    it("writes to .agents/mcp_config.json — confirmed against antigravity.google/docs/mcp", () => {
      expect(target.configPath).toBe(path.join(folder, ".agents", "mcp_config.json"));
    });

    it("uses the mcpServers format (same top-level key as Cursor/Claude Code)", () => {
      expect(target.format).toBe("mcpServers");
    });

    it("uses serverUrl, not url/httpUrl — Antigravity documents url/httpUrl as unsupported legacy fields", () => {
      const value = target.serverValue as Record<string, unknown>;
      expect(value.serverUrl).toBeTypeOf("string");
      expect(value.serverUrl as string).toContain(`project_root=${encodeURIComponent(folder)}`);
      expect(value.url).toBeUndefined();
      expect(value.httpUrl).toBeUndefined();
      expect(value.type).toBeUndefined();
    });

    it("omits headers entirely — confirmed unfixed Antigravity bug (antigravity-cli#71) breaks every " +
      "tool call when a headers block is present on a serverUrl entry; project_root already travels " +
      "in the query string, so nothing is lost by leaving headers out", () => {
      const value = target.serverValue as Record<string, unknown>;
      expect(value).not.toHaveProperty("headers");
    });
  });
});

describe("buildMcpTargets", () => {
  it("returns no targets when no folder is open (all targets are project-level)", () => {
    expect(buildMcpTargets(null)).toEqual([]);
  });
});

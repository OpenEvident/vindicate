import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { WorkspaceResolver } from "../../../src/extension/filesystem/WorkspaceResolver";

describe("WorkspaceResolver", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), show: vi.fn() };

  const context = {
    globalState: {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined)
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vscode.__resetVscodeMock();
    context.globalState.get.mockReturnValue(undefined);
  });

  it("returns none when no workspace folders", async () => {
    vscode.__setWorkspaceFolders(undefined);
    const resolver = new WorkspaceResolver(context as never, logger);
    const result = await resolver.resolve();
    expect(result).toEqual({ kind: "none" });
    resolver.dispose();
  });

  it("returns single folder when one root is open", async () => {
    const folder = { uri: vscode.Uri.file("/repo"), name: "repo", index: 0 };
    vscode.__setWorkspaceFolders([folder]);
    const resolver = new WorkspaceResolver(context as never, logger);
    const result = await resolver.resolve();
    expect(result).toEqual({ kind: "single", folder });
    resolver.dispose();
  });

  it("uses saved folder for multi-root workspaces", async () => {
    const a = { uri: vscode.Uri.file("/a"), name: "a", index: 0 };
    const b = { uri: vscode.Uri.file("/b"), name: "b", index: 1 };
    vscode.__setWorkspaceFolders([a, b]);
    vscode.__setWorkspaceFile("/workspace.code-workspace");
    context.globalState.get.mockReturnValue("/b");
    const resolver = new WorkspaceResolver(context as never, logger);
    const result = await resolver.resolve();
    expect(result).toEqual({ kind: "multi", folder: b });
    resolver.dispose();
  });

  it("prompts and persists selection when multi-root has no saved folder", async () => {
    const a = { uri: vscode.Uri.file("/a"), name: "a", index: 0 };
    const b = { uri: vscode.Uri.file("/b"), name: "b", index: 1 };
    vscode.__setWorkspaceFolders([a, b]);
    vscode.__setFolderPick(b);
    const resolver = new WorkspaceResolver(context as never, logger);
    const result = await resolver.resolve();
    expect(result).toEqual({ kind: "multi", folder: b });
    expect(context.globalState.update).toHaveBeenCalledWith(
      "vindicate.selectedFolder:multi-root",
      "/b"
    );
    resolver.dispose();
  });

  it("returns none when user cancels multi-root picker", async () => {
    const a = { uri: vscode.Uri.file("/a"), name: "a", index: 0 };
    const b = { uri: vscode.Uri.file("/b"), name: "b", index: 1 };
    vscode.__setWorkspaceFolders([a, b]);
    vscode.__setFolderPick(undefined);
    const resolver = new WorkspaceResolver(context as never, logger);
    const result = await resolver.resolve();
    expect(result).toEqual({ kind: "none" });
    resolver.dispose();
  });
});

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";

export interface IToolDetector {
  detect(): Promise<DetectedTools>;
}

export interface DetectedTools {
  cursor: boolean;
  vscodeNative: boolean;
  claudeCode: boolean;
  antigravity: boolean;
}

export class ToolDetector implements IToolDetector {
  async detect(): Promise<DetectedTools> {
    const appName = vscode.env.appName.toLowerCase();
    const cursor = appName.includes("cursor");
    // Live-confirmed: Antigravity IDE reports appName "Antigravity IDE" (vscode.env.appName), uriScheme
    // "antigravity-ide", vscode.version 1.107.0. Antigravity is itself a VS Code fork, so — like
    // Cursor — it's a distinct appName value, not a `vscodeNative` case.
    const antigravity = appName.includes("antigravity");
    const home = homedir();

    return {
      cursor,
      vscodeNative: !cursor && !antigravity,
      claudeCode:
        (await exists(path.join(home, ".claude.json"))) ||
        (await exists(path.join(home, ".claude"))),
      antigravity
    };
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

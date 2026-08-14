import * as vscode from "vscode";
import { STATE_KEYS } from "../shared/constants";
import type { ILogger } from "../shared/logger";

export interface IWorkspaceResolver {
  resolve(): Promise<WorkspaceResolution>;
  readonly onDidChange: vscode.Event<WorkspaceResolution>;
}

export type WorkspaceResolution =
  | { kind: "none" }
  | { kind: "single"; folder: vscode.WorkspaceFolder }
  | { kind: "multi"; folder: vscode.WorkspaceFolder };

export class WorkspaceResolver implements IWorkspaceResolver, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<WorkspaceResolution>();
  private readonly disposables: vscode.Disposable[] = [];

  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: ILogger
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.resolve().then((resolution) => this.emitter.fire(resolution));
      })
    );
  }

  async resolve(): Promise<WorkspaceResolution> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return { kind: "none" };
    }
    if (folders.length === 1) {
      return { kind: "single", folder: folders[0]! };
    }

    const workspaceFile = vscode.workspace.workspaceFile?.fsPath ?? "multi-root";
    const key = `${STATE_KEYS.selectedFolder}:${workspaceFile}`;
    const savedUri = this.context.globalState.get<string>(key);
    if (savedUri) {
      const match = folders.find((f) => f.uri.fsPath === savedUri);
      if (match) {
        return { kind: "multi", folder: match };
      }
    }

    const pick = await vscode.window.showWorkspaceFolderPick({
      placeHolder: "Select Vindicate project folder"
    });
    if (!pick) {
      this.logger.warn("No workspace folder selected for Vindicate.");
      return { kind: "none" };
    }

    await this.context.globalState.update(key, pick.uri.fsPath);
    return { kind: "multi", folder: pick };
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

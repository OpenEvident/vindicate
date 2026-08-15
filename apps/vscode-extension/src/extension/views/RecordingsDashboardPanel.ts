import path from "node:path";
import * as vscode from "vscode";
import { buildWebviewHtml, panelIconPath } from "./WebviewHtmlBuilder";

export type RecordingsDashboardWebviewMessage = Record<string, unknown>;

export class RecordingsDashboardPanel {
  private static current: RecordingsDashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private messageDisposable: vscode.Disposable | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    panel.onDidDispose(() => {
      this.messageDisposable?.dispose();
      RecordingsDashboardPanel.current = undefined;
    });
  }

  get webview(): vscode.Webview {
    return this.panel.webview;
  }

  static getCurrent(): RecordingsDashboardPanel | undefined {
    return RecordingsDashboardPanel.current;
  }

  static openOrReveal(extensionUri: vscode.Uri, projectRoot?: string): RecordingsDashboardPanel {
    if (RecordingsDashboardPanel.current !== undefined) {
      RecordingsDashboardPanel.current.panel.reveal(vscode.ViewColumn.One);
      return RecordingsDashboardPanel.current;
    }
    const resourceRoots = [extensionUri];
    if (projectRoot !== undefined) {
      resourceRoots.push(vscode.Uri.file(path.join(projectRoot, ".vindicate", "recordings")));
    }
    const panel = vscode.window.createWebviewPanel(
      "vindicateRecordingsDashboard",
      "Vindicate Recordings",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: resourceRoots }
    );
    panel.iconPath = panelIconPath(extensionUri);
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri, "recording");
    const instance = new RecordingsDashboardPanel(panel);
    RecordingsDashboardPanel.current = instance;
    return instance;
  }

  postMessage(message: RecordingsDashboardWebviewMessage): void {
    void this.panel.webview.postMessage(message).then(undefined, () => {
      /* panel disposed */
    });
  }

  setMessageHandler(handler: (msg: RecordingsDashboardWebviewMessage) => void): void {
    this.messageDisposable?.dispose();
    this.messageDisposable = this.panel.webview.onDidReceiveMessage(handler);
  }

  dispose(): void {
    this.panel.dispose();
  }
}

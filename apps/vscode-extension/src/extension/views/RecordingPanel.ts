import path from "node:path";
import * as vscode from "vscode";
import { buildWebviewHtml, panelIconPath } from "./WebviewHtmlBuilder";

export type RecordingWebviewMessage = Record<string, unknown>;

export class RecordingPanel {
  private static readonly panels = new Map<string, RecordingPanel>();

  private readonly panel: vscode.WebviewPanel;
  private messageDisposable: vscode.Disposable | undefined;

  private constructor(
    readonly sessionId: string,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    panel.onDidDispose(() => {
      this.messageDisposable?.dispose();
      RecordingPanel.panels.delete(sessionId);
    });
  }

  get webview(): vscode.Webview {
    return this.panel.webview;
  }

  static getOrCreate(
    sessionId: string,
    _context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    projectRoot: string,
    sessionName: string
  ): RecordingPanel {
    const existing = RecordingPanel.panels.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    return RecordingPanel.openOrReveal(extensionUri, sessionId, sessionName, projectRoot);
  }

  static openOrReveal(
    extensionUri: vscode.Uri,
    sessionId: string,
    sessionName: string,
    projectRoot?: string
  ): RecordingPanel {
    const existing = RecordingPanel.panels.get(sessionId);
    if (existing !== undefined) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const resourceRoots = [extensionUri];
    if (projectRoot !== undefined) {
      resourceRoots.push(vscode.Uri.file(path.join(projectRoot, ".vindicate", "recordings")));
    }

    const panel = vscode.window.createWebviewPanel(
      "vindicateRecording",
      `Recording: ${sessionName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: resourceRoots
      }
    );
    panel.iconPath = panelIconPath(extensionUri);
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri, "recording");
    const instance = new RecordingPanel(sessionId, panel);
    RecordingPanel.panels.set(sessionId, instance);
    return instance;
  }

  static get(sessionId: string): RecordingPanel | undefined {
    return RecordingPanel.panels.get(sessionId);
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  postMessage(message: RecordingWebviewMessage): void {
    void this.panel.webview.postMessage(message).then(undefined, () => {
      /* panel disposed */
    });
  }

  setMessageHandler(handler: (msg: RecordingWebviewMessage) => void): void {
    this.messageDisposable?.dispose();
    this.messageDisposable = this.panel.webview.onDidReceiveMessage(handler);
  }

  setTitle(title: string): void {
    this.panel.title = title;
  }

  dispose(): void {
    this.panel.dispose();
  }
}

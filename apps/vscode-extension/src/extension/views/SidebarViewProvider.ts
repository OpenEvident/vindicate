import * as vscode from "vscode";
import type { ExtensionMessage, WebviewMessage } from "../shared/messages";
import { buildWebviewHtml } from "./WebviewHtmlBuilder";

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageHandler: (msg: WebviewMessage) => Promise<void>,
    private readonly onVisibilityChange?: (visible: boolean) => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewView.webview.html = buildWebviewHtml(webviewView.webview, this.extensionUri, "sidebar");
    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      void this.messageHandler(msg);
    });
    this.onVisibilityChange?.(webviewView.visible);
    webviewView.onDidChangeVisibility(() => {
      this.onVisibilityChange?.(webviewView.visible);
    });
  }

  post(message: ExtensionMessage): void {
    void this.view?.webview.postMessage(message);
  }

  dispose(): void {
    this.onVisibilityChange?.(false);
    this.view = undefined;
  }
}

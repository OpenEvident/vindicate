import * as vscode from "vscode";
import type { ExtensionMessage, WebviewMessage } from "../shared/messages";
import { buildWebviewHtml } from "./WebviewHtmlBuilder";

export class EditorTabPanel implements vscode.Disposable {
  private static current: EditorTabPanel | undefined;

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly messageHandler: (msg: WebviewMessage) => Promise<void>,
    private readonly onVisibilityChange?: (visible: boolean) => void
  ) {
    this.panel = panel;
    panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      void this.messageHandler(msg);
    });
    this.onVisibilityChange?.(panel.visible);
    panel.onDidChangeViewState((event) => {
      this.onVisibilityChange?.(event.webviewPanel.visible);
    });
    panel.onDidDispose(() => {
      this.onVisibilityChange?.(false);
      EditorTabPanel.current = undefined;
    });
  }

  static getCurrent(): EditorTabPanel | undefined {
    return EditorTabPanel.current;
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    messageHandler: (msg: WebviewMessage) => Promise<void>,
    onVisibilityChange?: (visible: boolean) => void
  ): void {
    if (EditorTabPanel.current) {
      EditorTabPanel.current.panel.reveal(vscode.ViewColumn.One);
      onVisibilityChange?.(true);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vindicateHome",
      "Vindicate Home",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri, "editor");
    EditorTabPanel.current = new EditorTabPanel(panel, messageHandler, onVisibilityChange);
  }

  post(message: ExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    this.panel.dispose();
    EditorTabPanel.current = undefined;
  }
}

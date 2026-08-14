import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readExtensionVersion(extensionUri: vscode.Uri): string {
  try {
    const pkgPath = join(extensionUri.fsPath, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * VS Code webview HTML shell.
 *
 * Loads compiled assets from dist/webview/:
 * - main.css — Tailwind + app styles (PostCSS build; must stay a separate file)
 * - main.js  — React bundle (IIFE; must not inject CSS at runtime)
 *
 * @see https://code.visualstudio.com/api/extension-guides/webview
 */
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  surface: "sidebar" | "editor" | "panel" | "recording",
  extensionVersion?: string
): string {
  const nonce = generateNonce();
  const scriptUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"))
    .toString();
  const styleUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"))
    .toString();
  const logoUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "vindicate-logo.png"))
    .toString();
  const logoTextUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "vindicate-logo-text.png"))
    .toString();
  const brandCursorUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "cusrsor.png"))
    .toString();
  const brandClaudeUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "claude.png"))
    .toString();
  const brandCopilotUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "copilot.png"))
    .toString();
  const brandAntigravityUri = webview
    .asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "antigravity.png"))
    .toString();
  const resolvedVersion = extensionVersion ?? readExtensionVersion(extensionUri);

  return `<!DOCTYPE html>
<html lang="en" data-surface="${surface}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data: https:; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${escapeHtml(styleUri)}" rel="stylesheet" />
</head>
<body data-surface="${surface}">
  <div id="root" data-surface="${surface}" data-logo-uri="${escapeHtml(logoUri)}" data-logo-text-uri="${escapeHtml(logoTextUri)}" data-brand-cursor-uri="${escapeHtml(brandCursorUri)}" data-brand-claude-uri="${escapeHtml(brandClaudeUri)}" data-brand-copilot-uri="${escapeHtml(brandCopilotUri)}" data-brand-antigravity-uri="${escapeHtml(brandAntigravityUri)}" data-extension-version="${escapeHtml(resolvedVersion)}"></div>
  <script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
</body>
</html>`;
}

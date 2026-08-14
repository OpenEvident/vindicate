import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_KEYRING_BINDINGS } from "./ensure-keyring-platforms.mjs";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireFile(relativePath, minBytes = 1) {
  const filePath = path.join(extensionRoot, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Missing release artifact: ${relativePath}`);
  }
  const size = statSync(filePath).size;
  if (size < minBytes) {
    throw new Error(`${relativePath} is too small (${size} bytes)`);
  }
}

function requireNativeBinding(relativeDir) {
  const dirPath = path.join(extensionRoot, relativeDir);
  if (!existsSync(dirPath)) {
    throw new Error(`Missing keyring platform directory: ${relativeDir}`);
  }
  const hasNode = readdirSync(dirPath).some((entry) => entry.endsWith(".node"));
  if (!hasNode) {
    throw new Error(`No .node binary in ${relativeDir}`);
  }
}

requireFile("dist/extension.js", 10_000);
requireFile("dist/webview/main.js", 50_000);
requireFile("dist/webview/main.css", 4096);
requireFile("dist/bundled/runtime-worker/bundle.mjs", 100_000);
requireFile("dist/bundled/runtime-mcp/bundle.mjs", 100_000);
requireFile("dist/bundled/browsers.json", 100);
requireFile("dist/bundled/package.json", 10);
requireFile("dist/package.json", 10);

for (const binding of REQUIRED_KEYRING_BINDINGS) {
  requireNativeBinding(`dist/bundled/runtime-worker/node_modules/@napi-rs/${binding}`);
}

console.log(
  `Release bundle OK (${REQUIRED_KEYRING_BINDINGS.length} keyring platforms, worker + MCP bundles, webview).`
);

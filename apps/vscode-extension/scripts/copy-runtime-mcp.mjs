import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeMcpBundle = path.join(extensionRoot, "..", "runtime-mcp", "dist", "bundle.mjs");
const vindicateUiHtml = path.join(extensionRoot, "..", "vindicate-ui", "dist", "index.html");

if (!existsSync(runtimeMcpBundle)) {
  throw new Error(
    `Required build artifact missing: ${runtimeMcpBundle}\n` +
      "Run: pnpm --filter @vindicate/runtime-mcp run build:bundle"
  );
}

if (!existsSync(vindicateUiHtml)) {
  throw new Error(
    `Required build artifact missing: ${vindicateUiHtml}\n` +
      "Run: pnpm --filter @vindicate/vindicate-ui run build"
  );
}

const mcpOutputDir = path.resolve(extensionRoot, "dist", "bundled", "runtime-mcp");
rmSync(mcpOutputDir, { recursive: true, force: true });
mkdirSync(mcpOutputDir, { recursive: true });
copyFileSync(runtimeMcpBundle, path.join(mcpOutputDir, "bundle.mjs"));
copyFileSync(vindicateUiHtml, path.join(mcpOutputDir, "vindicate-ui.html"));

const runtimeContentDir = path.join(extensionRoot, "..", "runtime-mcp", "dist", "content");
if (!existsSync(runtimeContentDir)) {
  throw new Error(
    `Required content bundle missing: ${runtimeContentDir}\n` +
      "Run: pnpm --filter @vindicate/runtime-mcp run build"
  );
}
cpSync(runtimeContentDir, path.join(mcpOutputDir, "content"), { recursive: true });

console.log(
  "Copied runtime-mcp bundle, content, and vindicate-ui.html into dist/bundled/runtime-mcp/"
);

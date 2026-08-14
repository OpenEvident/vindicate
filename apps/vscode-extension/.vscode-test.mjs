import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@vscode/test-cli";

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  files: "tests/e2e/**/*.test.ts",
  extensionDevelopmentPath: extensionRoot,
  workspaceFolder: path.join(extensionRoot, "tests/e2e/fixtures/sample-project"),
  version: "stable",
  mocha: {
    timeout: 120_000,
    require: ["esbuild-register"]
  }
});

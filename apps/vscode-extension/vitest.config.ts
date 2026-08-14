import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "tests/mocks/vscode.ts"),
      "@": path.resolve(__dirname, "src/webview"),
    },
  },
  test: {
    globals: true,
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/webview/main.tsx", "src/extension/extension.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75 }
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          exclude: ["tests/unit/webview/**"],
          environment: "node"
        }
      },
      {
        extends: true,
        test: {
          name: "unit-webview",
          include: ["tests/unit/webview/**/*.test.ts"],
          environment: "jsdom"
        }
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["tests/component/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/component/setup.ts"]
        }
      }
    ]
  }
});

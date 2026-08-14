import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const extensionGlobals = {
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  Buffer: "readonly",
  NodeJS: "readonly",
  fetch: "readonly",
  URLSearchParams: "readonly",
  AbortSignal: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "readonly",
  require: "readonly",
  exports: "readonly"
};

const webviewGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  acquireVsCodeApi: "readonly",
  MessageEvent: "readonly",
  MutationObserver: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly"
};

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "tests/**", ".vscode-test/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/extension/**/*.ts"],
    languageOptions: {
      globals: extensionGlobals,
      parserOptions: {
        project: "./tsconfig.extension.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error"
    }
  },
  {
    files: ["src/webview/**/*.{ts,tsx}"],
    languageOptions: {
      globals: webviewGlobals,
      parserOptions: {
        project: "./tsconfig.webview.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "react/react-in-jsx-scope": "off"
    }
  },
  eslintConfigPrettier
);

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

import { zodV4Recommended } from "../../packages/config/eslint/zod-v4.mjs";

export default tseslint.config(
  ...zodV4Recommended,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      // Golden/codegen-lab fixture projects are snapshot artifacts, not runtime-mcp source.
      "tests/codegen-lab/fixtures/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/require-await": "error"
    }
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  prettierConfig
);

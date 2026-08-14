import { defineConfig } from "vitest/config";

process.env.VINDICATE_INTERNAL_KEY ??= "0123456789abcdef0123456789abcdef";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["tests/**", "dist/**", "**/*.test.ts"]
    }
  }
});

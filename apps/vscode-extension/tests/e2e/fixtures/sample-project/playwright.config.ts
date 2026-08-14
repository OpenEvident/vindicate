import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["json", { outputFile: "test-results.json" }]]
});

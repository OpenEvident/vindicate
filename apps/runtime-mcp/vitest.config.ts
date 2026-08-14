import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineConfig } from "vitest/config";

const testRoot = path.join(os.tmpdir(), "vindicate-runtime-mcp-test");
mkdirSync(testRoot, { recursive: true });

process.env.VINDICATE_INTERNAL_KEY ??= "0123456789abcdef0123456789abcdef";
process.env.VINDICATE_PROJECT_ROOT ??= testRoot;

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/content/**", "**/tests/codegen-lab/fixtures/golden/**"]
  }
});

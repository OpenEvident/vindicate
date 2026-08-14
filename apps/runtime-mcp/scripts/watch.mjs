import * as esbuild from "esbuild";
import { watch } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function copyContent() {
  try {
    execFileSync(process.execPath, ["scripts/copy-content.mjs"], { cwd: root, stdio: "inherit" });
  } catch {
    // error already printed via stdio: inherit
  }
}

const BANNER =
  "import { createRequire } from 'node:module';" +
  "import { fileURLToPath } from 'node:url';" +
  "import { dirname } from 'node:path';" +
  "const require = createRequire(import.meta.url);" +
  "const __filename = fileURLToPath(import.meta.url);" +
  "const __dirname = dirname(__filename);";

const ctx = await esbuild.context({
  entryPoints: [path.join(root, "src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  banner: { js: BANNER },
  outfile: path.join(root, "dist/bundle.mjs"),
  plugins: [
    {
      name: "copy-content-on-build",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) copyContent();
        });
      },
    },
  ],
});

await ctx.watch();

// Content files (templates/nodes/refs) aren't imported by TS so esbuild doesn't
// watch them — wire a native watcher so edits are copied without a restart.
let debounce;
watch(path.join(root, "content"), { recursive: true }, () => {
  clearTimeout(debounce);
  debounce = setTimeout(copyContent, 100);
});

console.log("[runtime-mcp] watching src/ and content/...");

import { spawnSync } from "node:child_process";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

function copyRuntimeBundles() {
  for (const script of ["copy-runtime-worker.mjs", "copy-runtime-mcp.mjs"]) {
    const result = spawnSync("node", [`scripts/${script}`], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (result.status !== 0) {
      throw new Error(`${script} failed`);
    }
  }
}
const isProduction = process.env.NODE_ENV === "production";

const options = {
  entryPoints: ["src/extension/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: !isProduction,
  external: ["vscode"],
  logLevel: "info",
  target: "node22",
  minify: isProduction
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyRuntimeBundles();
} else {
  await esbuild.build(options);
  copyRuntimeBundles();
}

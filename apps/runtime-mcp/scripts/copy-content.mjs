import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const sourceContent = path.join(packageRoot, "content");

function copyContentTree(targetDir) {
  if (!existsSync(sourceContent)) {
    throw new Error(`Content source missing: ${sourceContent}`);
  }
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceContent, targetDir, { recursive: true });
  console.log(`Copied content → ${targetDir}`);
}

const targets = [
  path.join(packageRoot, "dist", "content"),
  path.join(packageRoot, "dist", "bundled", "runtime-mcp", "content")
];

for (const target of targets) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyContentTree(target);
}

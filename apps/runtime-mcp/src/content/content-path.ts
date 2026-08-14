import { existsSync } from "node:fs";
import path from "node:path";

export function resolveContentRoot(moduleDirname: string): string {
  // bundled: content/ is a sibling of bundle.mjs
  const fromBundle = path.join(moduleDirname, "content");
  if (existsSync(path.join(fromBundle, "graphs"))) {
    return fromBundle;
  }
  // dev (tsx src/): content/ is directly in module dir after copy-content
  const sibling = path.join(moduleDirname, "graphs");
  if (existsSync(sibling)) {
    return moduleDirname;
  }
  // dist (node dist/main.js): ../content
  const packageContent = path.join(moduleDirname, "..", "..", "content");
  if (existsSync(path.join(packageContent, "graphs"))) {
    return packageContent;
  }
  throw new Error(
    `Vindicate content bundle not found (looked in ${fromBundle}, ${moduleDirname} and ${packageContent}). ` +
      "Run the runtime-mcp build copy-content step."
  );
}

/**
 * @file Resolves worker package version at runtime (works from `dist/` or `src/` via `import.meta.url`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json"
);

let cachedVersion: string | undefined;

export function getWorkerPackageVersion(): string {
  if (cachedVersion === undefined) {
    const raw = readFileSync(packageJsonPath, "utf8");
    cachedVersion = (JSON.parse(raw) as { version: string }).version;
  }
  return cachedVersion;
}

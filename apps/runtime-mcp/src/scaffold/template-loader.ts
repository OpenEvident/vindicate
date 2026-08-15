import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Monorepo-only paths — not emitted by scaffold_project. */
const SCAFFOLD_EXCLUDED_DIRS = new Set([".vindicate-template-types"]);

/** Which layer(s) of the template tree to load. `shared/` is always loaded regardless. */
export type ScaffoldTarget = "ui" | "api" | "both";

function resolveTemplatesDir(moduleDirname: string): string {
  // bundled: content/ is a sibling of bundle.mjs
  const fromBundle = path.join(moduleDirname, "content", "templates");
  if (existsSync(fromBundle)) {
    return fromBundle;
  }
  // dev (tsx src/): ../../content/templates
  const fromSource = path.join(moduleDirname, "..", "..", "content", "templates");
  if (existsSync(fromSource)) {
    return fromSource;
  }
  // dist (node dist/main.js): ../content/templates
  const fromDist = path.join(moduleDirname, "..", "content", "templates");
  if (existsSync(fromDist)) {
    return fromDist;
  }
  throw new Error(
    `Vindicate scaffold templates not found (looked in ${fromBundle}, ${fromSource} and ${fromDist}). ` +
      "Run the runtime-mcp build copy-content step."
  );
}

const TEMPLATES_DIR = resolveTemplatesDir(import.meta.dirname);

/** Subtrees to walk for a given target — `shared/` always, plus `ui/` and/or `api/`. Each
 * subtree's own relative paths (e.g. `ui/pages/BasePage.ts`) map to the same output-relative path
 * (`pages/BasePage.ts`) a single flat template tree used to produce, so scaffoldProject's own logic
 * (output paths, overwrite guards) doesn't need to know about this split at all. */
function subtreesFor(target: ScaffoldTarget): readonly string[] {
  if (target === "ui") return ["shared", "ui"];
  if (target === "api") return ["shared", "api"];
  return ["shared", "ui", "api"];
}

/** Output paths more than one subtree legitimately provides — merged (concatenated), never
 * silently overwritten. Currently just README.md: `ui/README.md` and `api/README.md` both exist
 * so each target's own scaffold gets a relevant readme, but a "both" scaffold needs to keep both,
 * not silently lose one to whichever subtree happens to be walked last. */
const MERGEABLE_OUTPUT_PATHS = new Set(["README.md"]);

export async function loadScaffoldTemplates(
  target: ScaffoldTarget = "both"
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const subtree of subtreesFor(target)) {
    const dir = path.join(TEMPLATES_DIR, subtree);
    if (!existsSync(dir)) {
      continue;
    }
    await walk(dir, "", out);
  }
  return out;
}

async function walk(dir: string, prefix: string, out: Record<string, string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SCAFFOLD_EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      await walk(full, rel, out);
    } else {
      const relPath = rel.replace(/\\/g, "/");
      const content = await readFile(full, "utf8");
      const existing = out[relPath];
      if (existing === undefined) {
        out[relPath] = content;
      } else if (MERGEABLE_OUTPUT_PATHS.has(relPath)) {
        out[relPath] = `${existing.trimEnd()}\n\n---\n\n${content}`;
      } else {
        // A collision on a path we haven't explicitly decided how to merge is a template-authoring
        // mistake, not a runtime condition to paper over — surface it instead of silently losing
        // whichever subtree's version was walked first.
        throw new Error(
          `Scaffold template collision at '${relPath}' — more than one subtree provides this file. ` +
            "Add it to MERGEABLE_OUTPUT_PATHS with an explicit merge strategy, or rename one of them."
        );
      }
    }
  }
}

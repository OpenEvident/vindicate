/** Display/storage path under the project, e.g. `.vindicate/recordings/login.json`. */
export function toVindicateRelativePath(filePath: string, projectRoot?: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.vindicate/";
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx >= 0) {
    return normalized.slice(idx + 1);
  }
  if (projectRoot !== undefined) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
    if (normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      return normalized.slice(root.length + 1);
    }
  }
  return normalized;
}

/** Resolve a `.vindicate/...` path or pass through an absolute path. */
export function resolveVindicatePath(projectRoot: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith(".vindicate/") || normalized === ".vindicate") {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
    return `${root}/${normalized}`;
  }
  return filePath;
}

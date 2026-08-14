const STORAGE_PREFIX = "vindicate.dashboard.mcpBannerHidden";

/** Pre–per-folder key (no path suffix). Removed on access; not read for hide state. */
const LEGACY_GLOBAL_KEY = STORAGE_PREFIX;

function removeLegacyGlobalMcpBannerKey(): void {
  try {
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
  } catch {
    // Webview storage may be unavailable in some hosts.
  }
}

/** Stable localStorage key per workspace folder path. */
export function mcpBannerStorageKey(folderPath: string | null): string {
  if (!folderPath?.trim()) {
    return `${STORAGE_PREFIX}:__no_folder__`;
  }
  return `${STORAGE_PREFIX}:${folderPath.replace(/\\/g, "/").toLowerCase()}`;
}

export function isDashboardMcpBannerHidden(folderPath: string | null): boolean {
  removeLegacyGlobalMcpBannerKey();
  try {
    return localStorage.getItem(mcpBannerStorageKey(folderPath)) === "1";
  } catch {
    return false;
  }
}

export function setDashboardMcpBannerHidden(folderPath: string | null, hidden: boolean): void {
  removeLegacyGlobalMcpBannerKey();
  try {
    const key = mcpBannerStorageKey(folderPath);
    if (hidden) {
      localStorage.setItem(key, "1");
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Webview storage may be unavailable in some hosts.
  }
}

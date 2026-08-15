import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LOG_DIR = path.join(os.homedir(), ".vindicate", "logs");
const MAX_LOG_FILES = 10;

/**
 * Creates a new session log file path under ~/.vindicate/logs/ and rotates old files,
 * keeping at most MAX_LOG_FILES total. Returns the absolute path to the new log file.
 */
export function createSessionLogFile(): string {
  mkdirSync(LOG_DIR, { recursive: true });

  try {
    const existing = readdirSync(LOG_DIR)
      .filter((f) => f.startsWith("vindicate-") && f.endsWith(".log"))
      .sort();
    const surplus = existing.length - (MAX_LOG_FILES - 1);
    if (surplus > 0) {
      for (const f of existing.slice(0, surplus)) {
        try {
          unlinkSync(path.join(LOG_DIR, f));
        } catch {
          // ignore individual deletion failures
        }
      }
    }
  } catch {
    // ignore rotation failures — don't block startup
  }

  // Use hyphens in time part so the name is valid on Windows (no colons)
  const stamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "Z");
  return path.join(LOG_DIR, `vindicate-${stamp}.log`);
}

export { LOG_DIR as VINDICATE_LOG_DIR };

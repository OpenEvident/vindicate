/**
 * @file Machine-wide internal key for the shared runtime-worker.
 *
 * The worker on :RUNTIME_PORT is a singleton shared by every editor/profile/app
 * on the machine (VS Code, Cursor, multiple windows, multiple projects). Each
 * editor previously generated its own random key in `context.secrets`, which is
 * not shared across editor apps or profiles — so a second editor would always
 * see a "different internal key" from whatever worker was already running.
 * Storing the key on disk instead means every editor reads the same value.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const KEY_DIR = path.join(homedir(), ".vindicate");
const KEY_FILE = path.join(KEY_DIR, "worker.key");
const KEY_BYTES = 32;
const MIN_KEY_LENGTH = 32;

function isValidKey(value: string): boolean {
  return value.trim().length >= MIN_KEY_LENGTH;
}

function isErrnoException(err: unknown, code: string): boolean {
  return err !== null && typeof err === "object" && "code" in err && err.code === code;
}

/**
 * Reads the shared key, creating it on first use. Concurrent first launches
 * (two editors starting at the same moment) are resolved by exclusive file
 * creation: the loser's write fails with EEXIST and it reads back the winner's
 * key instead of generating a second, incompatible one.
 */
export async function getOrCreateSharedWorkerKey(): Promise<string> {
  let existing: string | undefined;
  try {
    existing = await readFile(KEY_FILE, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing !== undefined && isValidKey(existing)) {
    return existing.trim();
  }

  await mkdir(KEY_DIR, { recursive: true });
  const key = randomBytes(KEY_BYTES).toString("hex");

  if (existing === undefined) {
    // File doesn't exist yet — exclusive create so a concurrent first launch
    // from another editor can't race us into two different keys.
    try {
      await writeFile(KEY_FILE, key, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return key;
    } catch (err) {
      if (!isErrnoException(err, "EEXIST")) {
        throw err;
      }
      const winner = await readFile(KEY_FILE, "utf8");
      if (isValidKey(winner)) {
        return winner.trim();
      }
      // Winner's write hasn't landed yet or was itself invalid — fall through
      // and repair the file below.
    }
  }

  // File exists but is corrupt/too short — repair it in place. `wx` doesn't
  // apply here since the file already exists.
  await writeFile(KEY_FILE, key, { encoding: "utf8", mode: 0o600 });
  return key;
}

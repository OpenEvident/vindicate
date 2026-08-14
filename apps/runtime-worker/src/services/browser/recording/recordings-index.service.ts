import fs from "node:fs/promises";
import path from "node:path";

import { RecordingsIndexSchema, type RecordingsIndex, type RecordingsIndexEntry } from "@vindicate/protocol";

import { recordingSlugKey } from "./recording-name.js";

const EMPTY_INDEX: RecordingsIndex = { version: 1, entries: [] };
const writeQueues = new Map<string, Promise<unknown>>();

async function withSerializedWrite<T>(projectRoot: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(projectRoot) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  writeQueues.set(
    projectRoot,
    current.then(
      () => undefined,
      () => undefined
    )
  );
  return current;
}

export class RecordingsIndexService {
  static indexPath(projectRoot: string): string {
    return path.join(projectRoot, ".vindicate", "recordings-index.json");
  }

  static async getAll(projectRoot: string): Promise<RecordingsIndex> {
    const filePath = RecordingsIndexService.indexPath(projectRoot);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = RecordingsIndexSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : EMPTY_INDEX;
    } catch {
      return EMPTY_INDEX;
    }
  }

  static async get(projectRoot: string, safeName: string): Promise<RecordingsIndexEntry | undefined> {
    const index = await RecordingsIndexService.getAll(projectRoot);
    const key = recordingSlugKey(safeName);
    return index.entries.find((entry) => recordingSlugKey(entry.safe_name) === key);
  }

  static async upsert(projectRoot: string, entry: RecordingsIndexEntry): Promise<void> {
    await withSerializedWrite(projectRoot, async () => {
      const index = await RecordingsIndexService.getAll(projectRoot);
      const entryKey = recordingSlugKey(entry.safe_name);
      const nextEntries = index.entries.filter((e) => recordingSlugKey(e.safe_name) !== entryKey);
      nextEntries.push(entry);
      nextEntries.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
      await RecordingsIndexService.write(projectRoot, { version: 1, entries: nextEntries });
    });
  }

  static async remove(projectRoot: string, safeName: string): Promise<void> {
    await withSerializedWrite(projectRoot, async () => {
      const index = await RecordingsIndexService.getAll(projectRoot);
      const key = recordingSlugKey(safeName);
      const nextEntries = index.entries.filter((e) => recordingSlugKey(e.safe_name) !== key);
      if (nextEntries.length === index.entries.length) {
        return;
      }
      await RecordingsIndexService.write(projectRoot, { version: 1, entries: nextEntries });
    });
  }

  private static async write(projectRoot: string, index: RecordingsIndex): Promise<void> {
    const dir = path.join(projectRoot, ".vindicate");
    await fs.mkdir(dir, { recursive: true });
    const filePath = RecordingsIndexService.indexPath(projectRoot);
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), "utf-8");
    await fs.rename(tmpPath, filePath);
  }
}

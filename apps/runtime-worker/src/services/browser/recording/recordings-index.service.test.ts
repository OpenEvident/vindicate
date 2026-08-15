import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { RecordingsIndexEntry } from "@vindicate/protocol";
import { RecordingsIndexService } from "./recordings-index.service.js";

function sampleEntry(safeName: string): RecordingsIndexEntry {
  return {
    name: safeName.replace(/-/g, " "),
    safe_name: safeName,
    path: `/tmp/${safeName}.json`,
    summary: "Test recording",
    pre_conditions: ["logged out"],
    post_conditions: ["logged in"],
    depends_on: [],
    pages_covered: ["https://example.com/login"],
    started_by: "human",
    recorded_at: "2026-06-12T10:00:00.000Z",
    step_count: 3,
    status: "finalized"
  };
}

describe("RecordingsIndexService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
    );
  });

  async function makeProjectRoot(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vindicate-recordings-index-"));
    tempDirs.push(dir);
    return dir;
  }

  it("returns empty index when file is missing", async () => {
    const projectRoot = await makeProjectRoot();
    const index = await RecordingsIndexService.getAll(projectRoot);
    expect(index).toEqual({ version: 1, entries: [] });
  });

  it("upserts and retrieves entries by safe_name", async () => {
    const projectRoot = await makeProjectRoot();
    const entry = sampleEntry("Login-Flow");
    await RecordingsIndexService.upsert(projectRoot, entry);

    const loaded = await RecordingsIndexService.get(projectRoot, "Login-Flow");
    expect(loaded?.name).toBe("Login Flow");
    expect(loaded?.step_count).toBe(3);
  });

  it("remove deletes an entry", async () => {
    const projectRoot = await makeProjectRoot();
    await RecordingsIndexService.upsert(projectRoot, sampleEntry("Login-Flow"));
    await RecordingsIndexService.remove(projectRoot, "Login-Flow");
    const index = await RecordingsIndexService.getAll(projectRoot);
    expect(index.entries).toHaveLength(0);
  });

  it("upsert replaces entries with the same slug key regardless of case", async () => {
    const projectRoot = await makeProjectRoot();
    await RecordingsIndexService.upsert(projectRoot, sampleEntry("Login-Flow"));
    await RecordingsIndexService.upsert(projectRoot, sampleEntry("login-flow"));

    const index = await RecordingsIndexService.getAll(projectRoot);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]?.safe_name).toBe("login-flow");
    expect(await RecordingsIndexService.get(projectRoot, "LOGIN-FLOW")).toBeDefined();
  });

  it("concurrent upserts preserve all entries", async () => {
    const projectRoot = await makeProjectRoot();
    await Promise.all([
      RecordingsIndexService.upsert(projectRoot, sampleEntry("Flow-A")),
      RecordingsIndexService.upsert(projectRoot, sampleEntry("Flow-B"))
    ]);
    const index = await RecordingsIndexService.getAll(projectRoot);
    expect(index.entries.map((e) => e.safe_name).sort()).toEqual(["Flow-A", "Flow-B"]);
  });
});

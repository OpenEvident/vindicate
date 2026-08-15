import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let homeDir = "";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => homeDir
  };
});

describe("getOrCreateSharedWorkerKey", () => {
  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(os.tmpdir(), "vindicate-shared-key-test-"));
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("creates a key file on first use and returns a key long enough for the worker's schema", async () => {
    const { getOrCreateSharedWorkerKey } =
      await import("../../../src/extension/shared/sharedWorkerKey");
    const key = await getOrCreateSharedWorkerKey();
    expect(key.length).toBeGreaterThanOrEqual(32);

    const onDisk = await readFile(path.join(homeDir, ".vindicate", "worker.key"), "utf8");
    expect(onDisk.trim()).toBe(key);
  });

  it("returns the same key on subsequent calls instead of generating a new one", async () => {
    const { getOrCreateSharedWorkerKey } =
      await import("../../../src/extension/shared/sharedWorkerKey");
    const first = await getOrCreateSharedWorkerKey();
    const second = await getOrCreateSharedWorkerKey();
    expect(second).toBe(first);
  });

  it("every caller (simulating every editor/profile/app) reads the identical key", async () => {
    const { getOrCreateSharedWorkerKey } =
      await import("../../../src/extension/shared/sharedWorkerKey");
    const results = await Promise.all([
      getOrCreateSharedWorkerKey(),
      getOrCreateSharedWorkerKey(),
      getOrCreateSharedWorkerKey()
    ]);
    expect(new Set(results).size).toBe(1);
  });

  it("recovers from a losing race (EEXIST) by reading the winner's key", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(homeDir, ".vindicate"), { recursive: true });
    await writeFile(path.join(homeDir, ".vindicate", "worker.key"), "a".repeat(64), "utf8");

    const { getOrCreateSharedWorkerKey } =
      await import("../../../src/extension/shared/sharedWorkerKey");
    const key = await getOrCreateSharedWorkerKey();
    expect(key).toBe("a".repeat(64));
  });

  it("regenerates when the key file is present but too short to be valid", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(homeDir, ".vindicate"), { recursive: true });
    await writeFile(path.join(homeDir, ".vindicate", "worker.key"), "too-short", "utf8");

    const { getOrCreateSharedWorkerKey } =
      await import("../../../src/extension/shared/sharedWorkerKey");
    const key = await getOrCreateSharedWorkerKey();
    expect(key.length).toBeGreaterThanOrEqual(32);
    expect(key).not.toBe("too-short");
  });
});

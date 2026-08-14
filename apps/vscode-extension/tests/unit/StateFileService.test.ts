import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateFileService } from "../../src/extension/shared/StateFileService";
import type { ILogger } from "../../src/extension/shared/logger";

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}

describe("StateFileService", () => {
  let folderPath: string;
  let logger: ILogger;
  let service: StateFileService;

  beforeEach(async () => {
    folderPath = await mkdtemp(path.join(tmpdir(), "vindicate-state-"));
    logger = createLogger();
    service = new StateFileService(logger);
  });

  afterEach(async () => {
    await rm(folderPath, { recursive: true, force: true });
  });

  it("read() returns {} when file does not exist", async () => {
    expect(await service.read(folderPath)).toEqual({});
  });

  it("read() returns {} and logs warning when file is malformed JSON", async () => {
    const vindicateDir = path.join(folderPath, ".vindicate");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(vindicateDir, { recursive: true });
    await writeFile(path.join(vindicateDir, "state.json"), "{not json", "utf8");
    expect(await service.read(folderPath)).toEqual({});
    expect(logger.warn).toHaveBeenCalled();
  });

  it("write() creates .vindicate/ directory if missing", async () => {
    const state = {
      selectedMode: "build" as const,
      completedSteps: [1, 2] as const,
      onboardingDone: false
    };
    await service.write(folderPath, state);
    const raw = await readFile(path.join(folderPath, ".vindicate", "state.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(state);
  });

  it("write() then read() round-trips correctly", async () => {
    const state = {
      selectedMode: "build" as const,
      completedSteps: [1, 2, 3] as const,
      onboardingDone: true
    };
    await service.write(folderPath, state);
    const partial = await service.read(folderPath);
    expect(partial).toEqual(state);
  });
});

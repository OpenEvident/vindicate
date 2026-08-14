import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { VindicateWorkspaceState } from "./types";
import type { ILogger } from "./logger";

export interface IStateFileService {
  read(folderPath: string): Promise<Partial<VindicateWorkspaceState>>;
  write(folderPath: string, state: VindicateWorkspaceState): Promise<void>;
}

const STATE_FILENAME = "state.json";

export class StateFileService implements IStateFileService {
  constructor(private readonly logger: ILogger) {}

  async read(folderPath: string): Promise<Partial<VindicateWorkspaceState>> {
    const filePath = path.join(folderPath, ".vindicate", STATE_FILENAME);
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as Partial<VindicateWorkspaceState>;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return {};
      this.logger.warn(`Could not read .vindicate/state.json: ${String(err)}`);
      return {};
    }
  }

  async write(folderPath: string, state: VindicateWorkspaceState): Promise<void> {
    const dir = path.join(folderPath, ".vindicate");
    const filePath = path.join(dir, STATE_FILENAME);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

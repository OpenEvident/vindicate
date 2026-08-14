import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { ScenarioDefinitionSchema, type ScenarioDefinition } from "./scenario-types.js";

export async function loadScenario(filePath: string): Promise<ScenarioDefinition> {
  const raw = await readFile(filePath, "utf8");
  const json = JSON.parse(raw) as unknown;
  return ScenarioDefinitionSchema.parse(json);
}

export async function loadScenarios(scenariosDir: string): Promise<ScenarioDefinition[]> {
  const entries = await readdir(scenariosDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(scenariosDir, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const scenarios: ScenarioDefinition[] = [];
  for (const file of files) {
    scenarios.push(await loadScenario(file));
  }
  return scenarios;
}

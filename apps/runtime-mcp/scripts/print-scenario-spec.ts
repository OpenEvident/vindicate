import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadScenarios } from "../tests/codegen-lab/lib/load-scenarios.js";
import { runScenario } from "../tests/codegen-lab/lib/run-scenario.js";
import { teardownProjectRoots } from "../tests/shared/codegen-testkit/project-root.js";

const scenarioId = process.argv[2];
const specRelPath = process.argv[3] ?? "tests/orders.spec.ts";

if (scenarioId === undefined) {
  console.error("Usage: tsx scripts/print-scenario-spec.ts <scenario-id> [spec-relative-path]");
  process.exit(1);
}

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenarios = await loadScenarios(
  path.join(runtimeRoot, "tests/codegen-lab/fixtures/scenarios")
);
const scenario = scenarios.find((s) => s.id === scenarioId);

if (scenario === undefined) {
  console.error(`Scenario not found: ${scenarioId}`);
  process.exit(1);
}

const result = await runScenario(scenario);

if (result.error !== undefined) {
  console.error("Scenario run failed:", result.error);
  process.exit(1);
}

const specPath = path.join(result.root, specRelPath);
const spec = await readFile(specPath, "utf8");
process.stdout.write(spec);
await teardownProjectRoots();

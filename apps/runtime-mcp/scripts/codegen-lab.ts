import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { assertScenario } from "../tests/codegen-lab/lib/assert-scenario.js";
import { readScenarioFile } from "../tests/codegen-lab/lib/invariants.js";
import { loadScenarios } from "../tests/codegen-lab/lib/load-scenarios.js";
import { runScenario } from "../tests/codegen-lab/lib/run-scenario.js";
import { teardownProjectRoots } from "../tests/shared/codegen-testkit/project-root.js";

function parseArgs(args: string[]): { updateGolden: boolean; scenarioId?: string } {
  const updateGolden = args.includes("--update-golden");
  const scenarioId = args.find((arg) => !arg.startsWith("--"));
  return { updateGolden, scenarioId };
}

const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeGoldenSnapshot(
  scenarioId: string,
  files: string[],
  root: string
): Promise<void> {
  const goldenDir = path.resolve(RUNTIME_MCP_ROOT, "tests/codegen-lab/fixtures/golden", scenarioId);
  await rm(goldenDir, { recursive: true, force: true });

  for (const rel of files) {
    const content = await readScenarioFile(root, rel);
    if (content === undefined) {
      throw new Error(`Cannot write golden snapshot: missing generated file '${rel}' for ${scenarioId}`);
    }
    const target = path.join(goldenDir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function main(): Promise<void> {
  const { updateGolden, scenarioId } = parseArgs(process.argv.slice(2));
  const scenarios = await loadScenarios(path.resolve(RUNTIME_MCP_ROOT, "tests/codegen-lab/fixtures/scenarios"));
  const selected = scenarioId === undefined ? scenarios : scenarios.filter((s) => s.id === scenarioId);

  if (selected.length === 0) {
    throw new Error(`No scenario found for id '${scenarioId}'`);
  }

  let failures = 0;
  for (const scenario of selected) {
    const result = await runScenario(scenario);
    try {
      if (updateGolden) {
        if (scenario.expect.golden !== true) {
          continue;
        }
        const files = scenario.expect.goldenFiles ?? [];
        if (files.length === 0) {
          throw new Error(`Scenario ${scenario.id} has golden=true but no goldenFiles configured`);
        }
        await writeGoldenSnapshot(scenario.id, files, result.root);
        process.stdout.write(`updated golden: ${scenario.id}\n`);
      } else {
        await assertScenario(result);
        process.stdout.write(`pass: ${scenario.id}\n`);
      }
    } catch (error: unknown) {
      failures += 1;
      process.stderr.write(`fail: ${scenario.id}\n${String(error)}\n`);
    }
  }

  await teardownProjectRoots();
  if (failures > 0) {
    process.exit(1);
  }
}

void main();

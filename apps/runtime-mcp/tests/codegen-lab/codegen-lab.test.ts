import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { assertScenario } from "./lib/assert-scenario.js";
import { loadScenarios } from "./lib/load-scenarios.js";
import { runScenario } from "./lib/run-scenario.js";
import { teardownProjectRoots } from "../shared/codegen-testkit/project-root.js";

const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scenariosDir = path.resolve(RUNTIME_MCP_ROOT, "tests/codegen-lab/fixtures/scenarios");
const scenarios = await loadScenarios(scenariosDir);

describe("codegen lab scenarios", () => {
  afterAll(async () => {
    await teardownProjectRoots();
  });

  for (const scenario of scenarios) {
    it(scenario.id, async () => {
      const result = await runScenario(scenario);
      await expect(assertScenario(result)).resolves.toBeUndefined();
    });
  }
});

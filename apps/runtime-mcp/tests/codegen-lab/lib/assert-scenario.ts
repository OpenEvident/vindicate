import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ScenarioRunResult } from "./scenario-types.js";
import type { ScenarioExpect } from "./scenario-types.js";
const RUNTIME_MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
import { compileGeneratedProject } from "./compile-check.js";
import { runInvariants, readScenarioFile } from "./invariants.js";

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function assertErrorExpectation(result: ScenarioRunResult): void {
  const expected = result.scenario.expect.error;
  if (result.error === undefined) {
    throw new Error(`Scenario ${result.scenario.id} expected an error but completed successfully`);
  }
  if (expected === undefined) {
    return;
  }
  const err = result.error as { name?: string; message?: string; fix?: string };
  if (err.name !== expected.type) {
    throw new Error(
      `Scenario ${result.scenario.id} expected error '${expected.type}' but got '${err.name}'`
    );
  }
  if (
    expected.messageIncludes !== undefined &&
    !String(err.message ?? "").includes(expected.messageIncludes)
  ) {
    throw new Error(
      `Scenario ${result.scenario.id} expected error message to include '${expected.messageIncludes}' but got '${err.message}'`
    );
  }
  if (expected.fixIncludes !== undefined && !String(err.fix ?? "").includes(expected.fixIncludes)) {
    throw new Error(
      `Scenario ${result.scenario.id} expected error fix to include '${expected.fixIncludes}' but got '${err.fix}'`
    );
  }
}

async function assertFileContains(
  root: string,
  expectations: Record<string, string[]>,
  shouldContain: boolean
): Promise<void> {
  for (const [file, checks] of Object.entries(expectations)) {
    const content = await readFile(path.join(root, file), "utf8");
    for (const check of checks) {
      const hasValue = content.includes(check);
      if (shouldContain && !hasValue) {
        throw new Error(`Expected '${file}' to contain '${check}'`);
      }
      if (!shouldContain && hasValue) {
        throw new Error(`Expected '${file}' to not contain '${check}'`);
      }
    }
  }
}

async function assertGolden(result: ScenarioRunResult): Promise<void> {
  const scenarioId = result.scenario.id;
  const goldenDir = path.resolve(RUNTIME_MCP_ROOT, "tests/codegen-lab/fixtures/golden", scenarioId);
  const goldenFiles = result.scenario.expect.goldenFiles ?? [];
  if (goldenFiles.length === 0) {
    throw new Error(
      `Golden check failed for ${scenarioId}: golden=true requires non-empty goldenFiles`
    );
  }

  for (const rel of goldenFiles) {
    const goldenPath = path.join(goldenDir, rel);
    if (!(await exists(goldenDir, rel))) {
      throw new Error(`Golden check failed for ${scenarioId}: missing golden file '${rel}'`);
    }
    const actual = await readScenarioFile(result.root, rel);
    if (actual === undefined) {
      throw new Error(`Golden check failed for ${scenarioId}: missing actual file '${rel}'`);
    }
    const expected = await readFile(goldenPath, "utf8");
    if (actual !== expected) {
      throw new Error(
        `Golden check failed for ${scenarioId}: '${rel}' differs from golden snapshot`
      );
    }
  }
}

function assertValidateExpectation(
  result: ScenarioRunResult,
  validation: NonNullable<ScenarioRunResult["lastValidation"]>,
  expected: NonNullable<ScenarioExpect["validate"]>,
  label = "last validation"
): void {
  if (validation.valid !== expected.valid) {
    throw new Error(
      `Scenario ${result.scenario.id}: expected ${label} valid=${expected.valid} but got valid=${validation.valid} (${validation.errorCount} errors)`
    );
  }
  if (expected.errorCount !== undefined && validation.errorCount !== expected.errorCount) {
    throw new Error(
      `Scenario ${result.scenario.id}: expected errorCount=${expected.errorCount} but got ${validation.errorCount}`
    );
  }
  if (expected.errorCountMin !== undefined && validation.errorCount < expected.errorCountMin) {
    throw new Error(
      `Scenario ${result.scenario.id}: expected at least ${expected.errorCountMin} errors but got ${validation.errorCount}`
    );
  }
  if (expected.codesInclude !== undefined) {
    for (const code of expected.codesInclude) {
      if (!validation.errors.some((e) => e.code === code)) {
        throw new Error(
          `Scenario ${result.scenario.id}: expected error code '${code}' in validation.errors`
        );
      }
    }
  }
  if (expected.pathsInclude !== undefined) {
    for (const path of expected.pathsInclude) {
      if (!validation.errors.some((e) => e.path.includes(path))) {
        throw new Error(`Scenario ${result.scenario.id}: expected error path containing '${path}'`);
      }
    }
  }
}

export async function assertScenario(result: ScenarioRunResult): Promise<void> {
  const expectSpec = result.scenario.expect;

  if (expectSpec.ok) {
    if (result.error !== undefined) {
      if (result.error instanceof Error) {
        throw result.error;
      }
      const detail =
        typeof result.error === "string"
          ? result.error
          : (() => {
              try {
                return JSON.stringify(result.error);
              } catch {
                return "Unknown non-Error thrown value";
              }
            })();
      throw new Error(detail);
    }
  } else {
    assertErrorExpectation(result);
    return;
  }

  for (const rel of expectSpec.filesExist ?? []) {
    if (!(await exists(result.root, rel))) {
      throw new Error(`Scenario ${result.scenario.id}: expected file '${rel}' to exist`);
    }
  }

  for (const rel of expectSpec.filesNotExist ?? []) {
    if (await exists(result.root, rel)) {
      throw new Error(`Scenario ${result.scenario.id}: expected file '${rel}' to not exist`);
    }
  }

  for (const rel of expectSpec.filesWrittenIncludes ?? []) {
    if (!result.filesWritten.includes(rel)) {
      throw new Error(`Scenario ${result.scenario.id}: filesWritten does not include '${rel}'`);
    }
  }

  for (const rel of expectSpec.filesWrittenExcludes ?? []) {
    if (result.filesWritten.includes(rel)) {
      throw new Error(
        `Scenario ${result.scenario.id}: filesWritten unexpectedly includes '${rel}'`
      );
    }
  }

  if (expectSpec.mustContain !== undefined) {
    await assertFileContains(result.root, expectSpec.mustContain, true);
  }
  if (expectSpec.mustNotContain !== undefined) {
    await assertFileContains(result.root, expectSpec.mustNotContain, false);
  }

  if (expectSpec.validate !== undefined) {
    const validation = result.lastValidation;
    if (validation === undefined) {
      throw new Error(
        `Scenario ${result.scenario.id}: expected validate step but no validation result found`
      );
    }
    assertValidateExpectation(result, validation, expectSpec.validate);
  }

  if (expectSpec.validateSteps !== undefined) {
    for (const expectedStep of expectSpec.validateSteps) {
      const stepResult = result.stepResults[expectedStep.stepIndex];
      if (stepResult?.validation === undefined) {
        throw new Error(
          `Scenario ${result.scenario.id}: expected validate result at step ${expectedStep.stepIndex}`
        );
      }
      assertValidateExpectation(
        result,
        stepResult.validation,
        expectedStep,
        `validation step ${expectedStep.stepIndex}`
      );
    }
  }

  if (expectSpec.invariants !== undefined && expectSpec.invariants.length > 0) {
    await runInvariants(result, expectSpec.invariants);
  }

  if (expectSpec.compile === true) {
    await compileGeneratedProject(result.root);
  }

  if (expectSpec.golden === true) {
    await assertGolden(result);
  }
}

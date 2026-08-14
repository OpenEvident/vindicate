import { runGenerator } from "../../../src/codegen/generator.js";
import {
  createProjectRoot,
  type CreateProjectRootOptions
} from "../../shared/codegen-testkit/project-root.js";
import type { ScenarioRunResult, ScenarioDefinition, ScenarioStepResult } from "./scenario-types.js";

function toProjectRootOptions(scenario: ScenarioDefinition): CreateProjectRootOptions {
  return {
    ...(scenario.project?.withBarrels !== undefined
      ? { withBarrels: scenario.project.withBarrels }
      : {}),
    ...(scenario.project?.scaffold !== undefined
      ? { scaffoldPreset: scenario.project.scaffold }
      : {})
  };
}

export async function runScenario(scenario: ScenarioDefinition): Promise<ScenarioRunResult> {
  const { root, fs } = await createProjectRoot(toProjectRootOptions(scenario));
  const stepResults: ScenarioStepResult[] = [];
  const aggregateFiles = new Set<string>();

  try {
    if (scenario.project?.seedSchema !== undefined) {
      const { feature, schema } = scenario.project.seedSchema;
      await fs.write(`.vindicate/schemas/${feature}.json`, `${JSON.stringify(schema, null, 2)}\n`);
    }
    if (scenario.project?.prewriteFiles !== undefined) {
      for (const [filePath, content] of Object.entries(scenario.project.prewriteFiles)) {
        await fs.write(filePath, content);
      }
    }

    for (const step of scenario.steps) {
      const result = await runGenerator(fs, step.input);
      if ("valid" in result) {
        stepResults.push({
          mode: "validate",
          validation: result
        });
      } else {
        stepResults.push({
          mode: step.input.mode,
          filesWritten: result.filesWritten,
          ...(result.notice !== undefined ? { notice: result.notice } : {})
        });
        for (const file of result.filesWritten) {
          aggregateFiles.add(file);
        }
      }
    }

    const lastValidation = [...stepResults].reverse().find((s) => s.validation !== undefined)?.validation;

    return {
      scenario,
      root,
      stepResults,
      filesWritten: [...aggregateFiles],
      ...(lastValidation !== undefined ? { lastValidation } : {})
    };
  } catch (error: unknown) {
    return {
      scenario,
      root,
      stepResults,
      filesWritten: [...aggregateFiles],
      error
    };
  }
}

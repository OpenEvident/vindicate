import type { ProjectFs } from "../fs/project-fs.js";
import type { ValidateInput } from "./schema.js";
import { validateFullSchema } from "./validate-codegen.js";
import type { ValidationResult } from "./validation-errors.js";
import { finalizeValidationResult, validationError } from "./validation-errors.js";

function missingFieldResult(field: string, validateTarget: string): ValidationResult {
  return finalizeValidationResult([
    validationError(
      "schema_shape",
      field,
      `'${field}' is required for validateTarget '${validateTarget}'.`,
      `Provide '${field}' in validate input.`
    )
  ]);
}

export function runValidate(fs: ProjectFs, input: ValidateInput): ValidationResult {
  void fs;
  if (input.validateTarget !== "create") {
    return finalizeValidationResult([
      validationError(
        "schema_shape",
        "validateTarget",
        `validateTarget '${String(input.validateTarget)}' is not supported — only 'create' has a dry-run.`,
        "Use validateTarget:'create' with an inline schema, or run npm run audit after add_test_cases/register_page."
      )
    ]);
  }

  if (input.schema === undefined) {
    return missingFieldResult("schema", input.validateTarget);
  }
  return finalizeValidationResult(validateFullSchema(input.schema, input.feature));
}

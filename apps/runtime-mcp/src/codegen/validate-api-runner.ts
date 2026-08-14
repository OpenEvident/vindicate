import type { ProjectFs } from "../fs/project-fs.js";
import type { ApiValidateInput } from "./api-schema.js";
import { validateApiFullSchema } from "./api-validate-codegen.js";
import type { ValidationResult } from "./validation-errors.js";
import { finalizeValidationResult, validationError } from "./validation-errors.js";

export function runValidateApi(fs: ProjectFs, input: ApiValidateInput): ValidationResult {
  void fs;
  if (input.validateTarget !== "create_api") {
    return finalizeValidationResult([
      validationError(
        "schema_shape",
        "validateTarget",
        `validateTarget '${String(input.validateTarget)}' is not supported — only 'create_api' has a dry-run.`,
        "Use validateTarget:'create_api' with an inline schema, or run npm run audit after add_api_test_cases/register_client."
      )
    ]);
  }

  if (input.schema === undefined) {
    return finalizeValidationResult([
      validationError(
        "schema_shape",
        "schema",
        `'schema' is required for validateTarget '${input.validateTarget}'.`,
        "Provide 'schema' in validate_api input."
      )
    ]);
  }
  return finalizeValidationResult(validateApiFullSchema(input.schema, input.feature));
}

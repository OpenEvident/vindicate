import { CodegenStructuralError } from "../shared/errors.js";
import type { ValidationError } from "./validation-errors.js";

export function assertNoValidationErrors(errors: ValidationError[]): void {
  if (errors.length === 0) {
    return;
  }
  const first = errors[0]!;
  throw new CodegenStructuralError(
    errors.length === 1
      ? first.message
      : `${first.message} (+${errors.length - 1} more — use mode:'validate' for the full list)`,
    first.fix
  );
}

import type { CodegenRunResult, GeneratorResult } from "../../../../src/codegen/generator.js";

/** Narrows {@link CodegenRunResult} to {@link GeneratorResult} for write-mode generator tests. */
export function expectWritten(result: CodegenRunResult): GeneratorResult {
  if (!("filesWritten" in result)) {
    throw new Error("expected GeneratorResult (write op) but got ValidationResult");
  }
  return result;
}

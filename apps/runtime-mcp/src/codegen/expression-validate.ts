import ts from "typescript";

import type { ValidationError } from "./validation-errors.js";
import { validationError } from "./validation-errors.js";

export function tryValidateTsExpression(
  expression: string,
  path: string,
  context: string
): ValidationError | undefined {
  if (expression.length === 0) {
    return undefined;
  }

  const source = `(${expression})`;
  const transpiled = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext
    }
  });
  const diagnostics = transpiled.diagnostics ?? [];
  if (diagnostics.length === 0) {
    return undefined;
  }

  const detail = diagnostics
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
    .join("; ");

  return validationError(
    "invalid_assertion_arg",
    path,
    `${context}: invalid TypeScript expression '${expression}' (${detail})`,
    "Use a valid TypeScript expression. For exact URLs use quoted strings (example: \"'/login'\").",
    "'/login'"
  );
}

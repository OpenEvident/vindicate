/**
 * Shared Zod parsing helpers and a stable validation error shape for protocol consumers.
 */
import type { infer as ZodInfer, ZodError, ZodType } from "zod";

/** Thrown when inbound data fails protocol schema validation. */
export class ProtocolValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = "ProtocolValidationError";
    this.issues = issues;
  }
}

/** Flattens Zod issues into `path: message` strings for logs and API responses. */
export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Parses `value` with `schema` or throws {@link ProtocolValidationError}.
 *
 * @param label - Human-readable payload name used in the error message.
 */
export function parseProtocol<TSchema extends ZodType>(
  schema: TSchema,
  value: unknown,
  label = "payload"
): ZodInfer<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = formatZodIssues(result.error);
    throw new ProtocolValidationError(`Invalid ${label}`, issues);
  }
  return result.data;
}

/**
 * Non-throwing parse: returns typed data or a list of validation issue strings.
 */
export function safeParseProtocol<TSchema extends ZodType>(
  schema: TSchema,
  value: unknown
): { success: true; data: ZodInfer<TSchema> } | { success: false; issues: string[] } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, issues: formatZodIssues(result.error) };
}

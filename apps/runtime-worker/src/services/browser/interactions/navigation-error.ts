/**
 * @file Extract HTTP status from Playwright navigation failures (BROWSER-SERVICE §3.1).
 */
export interface NavigationFailureDetails {
  readonly message: string;
  readonly status?: number;
}

const STATUS_CODE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bstatus(?:\s+code)?[:\s]+(\d{3})\b/i,
  /\bHTTP\s+(\d{3})\b/,
  /\bResponse:\s+(\d{3})\b/i,
  /\breceived\s+(\d{3})\b/i
];

function parseStatusFromMessage(message: string): number | undefined {
  for (const pattern of STATUS_CODE_PATTERNS) {
    const match = pattern.exec(message);
    const code = match?.[1];
    if (code !== undefined) {
      const status = Number(code);
      if (status >= 100 && status <= 599) {
        return status;
      }
    }
  }
  return undefined;
}

function statusFromErrorObject(err: object): number | undefined {
  const status: unknown = Reflect.get(err, "status");
  if (typeof status === "number" && status >= 100 && status <= 599) {
    return status;
  }
  return undefined;
}

export function formatNavigationFailure(err: unknown): NavigationFailureDetails {
  if (err instanceof Error) {
    const fromObject = statusFromErrorObject(err);
    const fromMessage = parseStatusFromMessage(err.message);
    const status = fromObject ?? fromMessage;
    return status !== undefined ? { message: err.message, status } : { message: err.message };
  }
  return { message: "navigation failed" };
}

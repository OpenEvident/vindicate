/**
 * @file Pull the actionability condition Playwright was still waiting on out of a timeout error's
 * call log so `ActionTimeoutError` doesn't discard the one detail that actually explains why the
 * action never ran.
 */

/** Call-log lines that describe *how* Playwright is waiting, not *what* it's waiting for. */
const NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  /^waiting \d+ms$/i,
  /^retrying .*action$/i,
  /^waiting for locator/i,
  /^locator resolved to/i,
  /^waiting for element to be/i
];

const MAX_REASON_LENGTH = 200;

/** Strip ANSI SGR colour codes (ESC "[" ... "m") Playwright's call log carries on a TTY-attached
 * process — left in place, a real reason line like the escape-wrapped "- element is not visible"
 * fails the plain `startsWith("- ")` check below. */
function stripAnsi(s: string): string {
  const ESC = String.fromCharCode(27);
  return s
    .split(ESC)
    .join("")
    .replace(/\[[0-9;]*m/g, "");
}

export function extractTimeoutReason(message: string): string | undefined {
  const logLines = stripAnsi(message)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  if (logLines.length === 0) {
    return undefined;
  }

  const meaningful = logLines.filter((line) => !NOISE_PATTERNS.some((re) => re.test(line)));
  const pick =
    meaningful.length > 0 ? meaningful[meaningful.length - 1] : logLines[logLines.length - 1];

  if (pick === undefined || pick.length === 0) {
    return undefined;
  }
  return pick.length > MAX_REASON_LENGTH ? `${pick.slice(0, MAX_REASON_LENGTH - 1)}…` : pick;
}

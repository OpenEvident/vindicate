import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROLE_NAME_FROM_CONTENT, roleTakesNameFromContent } from "./name-from-content.js";

/**
 * The name-from-content allowlist is inlined into each `page.evaluate` capture function because those
 * functions are serialized with `fn.toString()` and cannot import. This test is the seam that keeps the
 * copies honest: it reads each source file and asserts its inline copy matches the canon, so an edit to
 * one copy that forgets the others fails loudly instead of silently regressing one capture path.
 */
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const INLINE_COPIES: ReadonlyArray<{ label: string; file: string }> = [
  { label: "interactive-capture", file: path.join(here, "interactive-capture.evaluate.ts") },
  { label: "recording-capture", file: path.join(here, "..", "recording", "recording-capture.evaluate.ts") },
  {
    label: "recording-page-snapshot",
    file: path.join(here, "..", "recording", "recording-page-snapshot.evaluate.ts")
  }
];

function extractAllowlist(source: string): string[] {
  const match = source.match(/ROLE_NAME_FROM_CONTENT\s*=\s*\[([\s\S]*?)\]/);
  const body = match?.[1];
  if (body === undefined) {
    throw new Error("ROLE_NAME_FROM_CONTENT declaration not found");
  }
  return [...body.matchAll(/['"]([a-zA-Z]+)['"]/g)].map((m) => m[1] ?? "");
}

describe("name-from-content rule", () => {
  it("exposes a stable allowlist + predicate", () => {
    expect(roleTakesNameFromContent("button")).toBe(true);
    expect(roleTakesNameFromContent("alert")).toBe(false);
    expect(roleTakesNameFromContent("status")).toBe(false);
  });

  it.each(INLINE_COPIES)(
    "$label inline copy matches the canonical allowlist",
    ({ file }) => {
      const inline = extractAllowlist(readFileSync(file, "utf8"));
      // Order is irrelevant; membership is the contract.
      expect(new Set(inline)).toEqual(new Set(ROLE_NAME_FROM_CONTENT));
      expect(inline.length).toBe(ROLE_NAME_FROM_CONTENT.length);
    }
  );
});

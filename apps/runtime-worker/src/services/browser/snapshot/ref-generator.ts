/**
 * @file Tiered stable refs — FNV-1a digest, `ref-` prefix (BROWSER-SERVICE §1.5).
 * Algorithm matches `interactive-capture.evaluate.ts` for server-side ref computation.
 */
import { digestStableRefInput } from "./ref-digest.js";

const GENERATED_ID_PATTERNS: ReadonlyArray<RegExp> = [
  /^[a-z]+-[0-9a-f]{6,}$/i,
  /^\d+$/,
  // Kept in sync with interactive-capture.evaluate.ts's GENERATED_ID_RE — see that file for why this
  // needs to match both the bare React useId() token (":r0:") and library-prefixed variants
  // ("radix-:r0:").
  /^[a-z0-9_]*-?:[a-z0-9]+:$/i
];

export function isGeneratedDomId(id: string): boolean {
  return GENERATED_ID_PATTERNS.some((re) => re.test(id));
}

export { digestStableRefInput };

export function computeStableRef(input: {
  readonly tag: string;
  readonly testidValue?: string | undefined;
  readonly id?: string | undefined;
  readonly role: string;
  readonly name: string;
  readonly domPath: string;
}): string {
  const tag = input.tag.toLowerCase();
  if (input.testidValue !== undefined && input.testidValue.length > 0) {
    return digestStableRefInput(`${tag}${input.testidValue}`);
  }
  if (input.id !== undefined && input.id.length > 0 && !isGeneratedDomId(input.id)) {
    return digestStableRefInput(`${tag}${input.id}`);
  }
  if (input.name.length > 0) {
    return digestStableRefInput(`${tag}${input.role}${input.name}`);
  }
  return digestStableRefInput(`${tag}${input.domPath}`);
}

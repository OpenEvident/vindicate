/**
 * @file FNV-1a 32-bit stable ref digest — works in Node and non-secure browser contexts.
 * Inline copy must stay in sync with `interactive-capture.evaluate.ts` (page.evaluate boundary).
 */
export function digestStableRefInput(utf8: string): string {
  let h = 2166136261;
  for (let i = 0; i < utf8.length; i++) {
    h = Math.imul(h ^ utf8.charCodeAt(i), 16777619);
  }
  return `ref-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

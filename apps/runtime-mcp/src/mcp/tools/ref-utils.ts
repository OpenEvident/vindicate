/** Shared ref-string helpers for tools that address elements by `browser_read` ref. */

const REF_PATTERN = /^ref-[0-9a-f]{8}$/;

/**
 * Accepts the canonical `ref-<8-hex>` form or a bare 8-hex-char string (agents sometimes drop the
 * `ref-` prefix) and normalizes to the canonical form the worker's `RefSchema` requires. Anything
 * else passes through unchanged so the worker's own validation reports the real problem.
 */
export function normalizeRef(ref: string): string {
  if (REF_PATTERN.test(ref)) {
    return ref;
  }
  const bare = ref.replace(/^ref-?/i, "");
  if (/^[0-9a-f]{8}$/i.test(bare)) {
    return `ref-${bare.toLowerCase()}`;
  }
  return ref;
}

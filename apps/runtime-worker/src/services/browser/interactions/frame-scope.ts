/**
 * @file Shared `frame_path` → Playwright scope rendering, used by both the live ref-resolver
 * (browser_act) and recording playback (recorded/dependency-replayed steps) — the same walk, the same
 * XPath-renderable tier restriction, so an iframe-scoped locator resolves identically regardless of
 * which pipeline captured it.
 */
import type { StructuredLocator } from "@vindicate/protocol";
import type { FrameLocator, Page } from "playwright-core";

/**
 * Where a locator is rendered against — `Page` for ordinary elements, or a `FrameLocator` once
 * `frame_path` has scoped us inside one or more iframes. `FrameLocator` exposes the identical
 * `getByRole`/`getByTestId`/`getByLabel`/`getByPlaceholder`/`getByText`/`locator`/`frameLocator` surface
 * `Page` does, so every strategy renderer works unchanged regardless of which one `scope` actually is.
 */
export type LocatorScope = Page | FrameLocator;

/** XPath string literal that safely embeds either or both quote characters. */
function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const segs = s.split('"');
  return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
}

/**
 * Render one `frame_path` hop to a `frameLocator()` selector *string* (not a resolved `Locator` —
 * `frameLocator()` re-resolves its selector lazily on every access, the same auto-retrying behaviour
 * as every other Playwright locator, which a pre-resolved handle would defeat). Restricted to the
 * XPath-renderable tiers `deriveIframeHostLocator` (capture-time) is itself restricted to.
 *
 * `onUnrenderable` lets each caller raise its own error type (`ElementNotFoundError` for the live
 * resolver, a plain `Error` for recording playback) rather than this shared module picking one for both.
 */
export function renderFrameHopSelector(
  hop: StructuredLocator,
  onUnrenderable: (strategy: string) => never
): string {
  switch (hop.strategy) {
    case "testid":
      return `xpath=//*[@${hop.attr}=${xpathLiteral(hop.value ?? "")}]`;
    case "testid_xpath":
    case "dom_id":
    case "attr_combo":
    case "nth":
      return `xpath=${hop.xpath ?? ""}`;
    default:
      return onUnrenderable(hop.strategy);
  }
}

/** Walks `frame_path` (empty/absent for the overwhelming common case of a non-iframe element) into a
 * `Page | FrameLocator` scope for the caller's own locator renderer to resolve the final target against. */
export function resolveFrameScope(
  page: Page,
  framePath: readonly StructuredLocator[] | undefined,
  onUnrenderable: (strategy: string) => never
): LocatorScope {
  if (framePath === undefined || framePath.length === 0) {
    return page;
  }
  let scope: LocatorScope = page;
  for (const hop of framePath) {
    scope = scope.frameLocator(renderFrameHopSelector(hop, onUnrenderable));
  }
  return scope;
}

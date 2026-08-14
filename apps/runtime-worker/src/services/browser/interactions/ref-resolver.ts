/** Resolve snapshot `ref` strings to Playwright locators by rendering the stored structured locator. */
import { resolveRoleChain, type StructuredLocator } from "@vindicate/protocol";
import type { Locator, Page } from "playwright-core";

import type { ElementDescriptor } from "../snapshot/element-descriptor.js";
import { ElementNotFoundError } from "../../../shared/errors/worker.errors.js";
import { resolveFrameScope, type LocatorScope } from "./frame-scope.js";

type Role = Parameters<Page["getByRole"]>[0];

/** XPath string literal that safely embeds either or both quote characters. */
function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const segs = s.split('"');
  return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
}

/**
 * Render a `role_name` / `scoped` locator via the shared protocol call-chain decision — the same
 * source of truth codegen renders to source. Role-only when a step has no name (a name-prohibited role
 * like alert/status): a `{ name: "" }` filter would never match.
 */
function renderRoleChainLocator(scope: LocatorScope, ref: string, loc: StructuredLocator): Locator {
  const chain = resolveRoleChain(loc);
  if (chain === undefined || chain.length === 0) {
    throw new ElementNotFoundError(ref, "unrenderable locator — call browser_read and retry");
  }
  let result: Locator | undefined;
  for (const step of chain) {
    // Mirror codegen: bind `name` only when present, and add `exact` only when true (an `exact: false`
    // key is equivalent but would diverge from the rendered source and the existing call expectations).
    const opts =
      step.name === undefined
        ? undefined
        : step.exact
          ? { name: step.name, exact: true }
          : { name: step.name };
    result =
      result === undefined
        ? scope.getByRole(step.role as Role, opts)
        : result.getByRole(step.role as Role, opts);
  }
  if (result === undefined) {
    throw new ElementNotFoundError(ref, "unrenderable locator — call browser_read and retry");
  }
  return result;
}

/**
 * Render a verified structured locator to a live Playwright `Locator`. Semantic `getBy*` for the
 * accessibility tiers; XPath for attribute / id / positional tiers (never CSS). The worker honours
 * the session's test-id attribute directly via XPath, so it does not depend on Playwright's
 * `testIdAttribute` config the way generated tests do. `scope` is `page` itself unless `frame_path`
 * has already narrowed it to a `FrameLocator` — every case below is unchanged either way.
 */
function renderLocator(scope: LocatorScope, ref: string, loc: StructuredLocator): Locator {
  switch (loc.strategy) {
    case "testid":
      return scope.locator(`xpath=//*[@${loc.attr}=${xpathLiteral(loc.value ?? "")}]`);
    case "testid_xpath":
    case "dom_id":
    case "attr_combo":
    case "sibling_text":
    case "nth":
      return scope.locator(`xpath=${loc.xpath ?? ""}`);
    case "role_name":
    case "scoped":
      return renderRoleChainLocator(scope, ref, loc);
    case "label":
      return scope.getByLabel(loc.value ?? "", { exact: true });
    case "placeholder":
      return scope.getByPlaceholder(loc.value ?? "", { exact: true });
    case "text":
      return scope.getByText(loc.value ?? "", { exact: true });
    default:
      throw new ElementNotFoundError(ref, "unrenderable locator — call browser_read and retry");
  }
}

export async function resolveRef(
  page: Page,
  ref: string,
  descriptor: ElementDescriptor | undefined
): Promise<Locator> {
  if (descriptor === undefined) {
    throw new ElementNotFoundError(ref, "no descriptor — call browser_read and retry");
  }

  if (descriptor.snapshotUrl !== page.url()) {
    throw new ElementNotFoundError(
      ref,
      `is from a previous page (was ${descriptor.snapshotUrl}, now ${page.url()}) — call browser_read and retry`
    );
  }

  if (descriptor.locator === undefined) {
    // Unlike the two cases above, this is not transient — capture already tried every safe tier and
    // found none (e.g. no accessible name from any source inside a shadow root, or a blocked click
    // target with no click-delegate ancestor) and deliberately reported "no locator" rather than one
    // that would only ever time out. Re-reading the same DOM will not change that, so don't imply it will.
    throw new ElementNotFoundError(
      ref,
      "no derivable locator — capture already tried every safe tier and found none; this is not transient, so escalate instead of retrying (see browser_read for why)"
    );
  }

  const scope = resolveFrameScope(page, descriptor.locator.frame_path, () => {
    throw new ElementNotFoundError(ref, "unrenderable frame_path — call browser_read and retry");
  });
  const loc = renderLocator(scope, ref, descriptor.locator);

  // Act-time guard: the locator was verified unique at capture, but the DOM may have drifted since.
  // Catch genuine ambiguity here (Playwright's own strict mode also enforces this at action time);
  // a count of 0 is left to the action's auto-wait, which handles not-yet-rendered elements.
  const count = await loc.count();
  if (count > 1) {
    throw new ElementNotFoundError(
      ref,
      `resolved to ${count} elements (page changed since capture) — call browser_read for a more specific element`
    );
  }

  return loc;
}

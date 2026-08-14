import { resolveRoleChain, type RoleInvocation, type StructuredLocator } from "@vindicate/protocol";

import { CodegenLocatorError } from "../shared/errors.js";
import type { ElementDescriptor } from "./schema.js";

/**
 * Live-region / display roles whose accessible name is NOT taken from descendant text. Binding a
 * content-derived `name` to `getByRole` for these yields a locator that never matches (an alert's
 * message text is its content, not its accessible name). Codegen renders these role-only.
 */
const NAME_PROHIBITED_ROLES = new Set([
  "alert",
  "status",
  "log",
  "timer",
  "marquee",
  "alertdialog"
]);

const TAG_SUFFIX: Record<string, string> = {
  input: "Input",
  button: "Button",
  select: "Select",
  textarea: "Textarea",
  a: "Link",
  form: "Form",
  div: "Div",
  span: "Span",
  table: "Table",
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  img: "Image",
  label: "Label",
  li: "Item",
  ul: "List"
};

function tagSuffix(tag: string): string {
  return TAG_SUFFIX[tag] ?? "Element";
}

function camelCase(s: string): string {
  return s
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function stripPlaceholders(s: string): string {
  return s.replace(/\{[^}]*\}/g, "");
}

/** Valid camelCase private field name — used when testid/name are absent. */
const CAMEL_CASE_FIELD = /^[a-z][a-zA-Z0-9]*$/;
/** Placeholder refs from tests/capture — prefer tag/role-derived names instead. */
const GENERIC_ELEMENT_REF = /^e\d+$/;

export function isDynamicElement(el: ElementDescriptor): boolean {
  return el.dynamic !== undefined && el.dynamic.length > 0;
}

function templatize(value: string): string {
  return value.replace(/\{([^}]+)\}/g, (_, p: string) => "${" + p.trim() + "}");
}

export function deriveFieldName(el: ElementDescriptor): string {
  if (el.testid !== undefined && el.testid.length > 0) {
    return camelCase(stripPlaceholders(el.testid)) + tagSuffix(el.tag);
  }
  if (el.name !== undefined && el.name.length > 0) {
    return camelCase(stripPlaceholders(el.name)) + tagSuffix(el.tag);
  }
  if (CAMEL_CASE_FIELD.test(el.ref) && !GENERIC_ELEMENT_REF.test(el.ref)) {
    return el.ref;
  }
  if (el.role !== undefined && el.role.length > 0) {
    return camelCase(stripPlaceholders(el.role)) + tagSuffix(el.tag);
  }
  return camelCase(el.tag) + tagSuffix(el.tag);
}

/**
 * The structured locator codegen renders. The agent normally supplies `el.locator` (already verified
 * at capture). When only legacy fields are present, synthesize one deterministically — codegen never
 * touches a browser, so this is a pure field mapping, not a uniqueness check.
 */
export function resolveStructuredLocator(el: ElementDescriptor): StructuredLocator | undefined {
  if (el.locator !== undefined) {
    return el.locator;
  }
  if (el.testid !== undefined && el.testid_attr !== undefined) {
    return { strategy: "testid", confidence: "high", attr: el.testid_attr, value: el.testid };
  }
  if (el.role !== undefined && el.role.length > 0) {
    // Live-region / non-name-from-content roles: their inner text is not a matchable accessible name,
    // so getByRole(role,{name}) would never resolve. Render role-only. (The worker already suppresses
    // the name during capture; this guards hand-authored / legacy-field schemas, where we lack the DOM
    // to tell author names from content, so we only strip for the unambiguous live-region roles.)
    const useName =
      el.name !== undefined &&
      el.name.length > 0 &&
      !NAME_PROHIBITED_ROLES.has(el.role);
    return {
      strategy: "role_name",
      confidence: useName ? "high" : "low",
      role: el.role,
      ...(useName ? { name: el.name } : {})
    };
  }
  if (el.name !== undefined && el.name.length > 0) {
    return { strategy: "text", confidence: "low", value: el.name };
  }
  return undefined;
}

/** TS string literal: single-quoted for static locators, a backtick template for dynamic ones. */
function tsLit(value: string, dynamic: boolean): string {
  if (dynamic) {
    return "`" + templatize(value) + "`";
  }
  return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

/** Renders one `getByRole(...)` step as Playwright source. Role-only when the step has no name. */
function formatRoleStep(step: RoleInvocation, dynamic: boolean): string {
  if (step.name === undefined) {
    return `getByRole('${step.role}')`;
  }
  const opts = step.exact
    ? `{ name: ${tsLit(step.name, dynamic)}, exact: true }`
    : `{ name: ${tsLit(step.name, dynamic)} }`;
  return `getByRole('${step.role}', ${opts})`;
}

/** XPath string literal that safely embeds either or both quote characters — mirrors the runtime
 * resolver's identical helper (ref-resolver.ts) so live acting and generated source target the same
 * element via the same expression. */
function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const segs = s.split('"');
  return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
}

/**
 * Renders one `frame_path` hop as a `.frameLocator(...)` call. Mirrors ref-resolver.ts's
 * `renderFrameHopSelector` exactly — restricted to the same XPath-renderable strategies
 * `deriveIframeHostLocator` (capture-time) is itself restricted to, since an iframe boundary is a
 * structural anchor, not a role/text-bearing control.
 */
function renderFrameHopExpr(hop: StructuredLocator, ref: string, dynamic: boolean): string {
  let xp: string;
  switch (hop.strategy) {
    case "testid":
      xp = `//*[@${hop.attr}=${xpathLiteral(hop.value ?? "")}]`;
      break;
    case "testid_xpath":
    case "dom_id":
    case "attr_combo":
    case "nth":
      if (hop.xpath === undefined || hop.xpath.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a frame_path hop with no xpath expression.`);
      }
      xp = hop.xpath;
      break;
    default:
      throw new CodegenLocatorError(`ref '${ref}' has an unrenderable frame_path hop strategy.`);
  }
  return `.frameLocator(${tsLit(`xpath=${xp}`, dynamic)})`;
}

/** Base expression a locator builds from: `this.page`, or `this.page.frameLocator(...)...` once
 * `frame_path` has scoped it inside one or more iframes (absent/empty for the common non-iframe case). */
function renderScopeExpr(loc: StructuredLocator, ref: string, dynamic: boolean): string {
  const framePath = loc.frame_path ?? [];
  if (framePath.length === 0) {
    return "this.page";
  }
  return "this.page" + framePath.map((hop) => renderFrameHopExpr(hop, ref, dynamic)).join("");
}

/** Renders a `role_name` / `scoped` locator via the shared protocol call-chain decision. */
function renderRoleChain(loc: StructuredLocator, ref: string, dynamic: boolean): string {
  const chain = resolveRoleChain(loc);
  if (chain === undefined || chain.length === 0) {
    throw new CodegenLocatorError(`ref '${ref}' has a '${loc.strategy}' locator with no role.`);
  }
  return `${renderScopeExpr(loc, ref, dynamic)}.${chain.map((step) => formatRoleStep(step, dynamic)).join(".")}`;
}

function renderLocatorExpr(loc: StructuredLocator, ref: string, dynamic: boolean): string {
  const scope = renderScopeExpr(loc, ref, dynamic);
  switch (loc.strategy) {
    case "testid":
      // Resolves via the project's `testIdAttribute` (set in playwright.config by setup).
      if (loc.value === undefined || loc.value.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a 'testid' locator with no value.`);
      }
      return `${scope}.getByTestId(${tsLit(loc.value, dynamic)})`;
    case "role_name":
      return renderRoleChain(loc, ref, dynamic);
    case "label":
      if (loc.value === undefined || loc.value.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a 'label' locator with no value.`);
      }
      return `${scope}.getByLabel(${tsLit(loc.value, dynamic)})`;
    case "placeholder":
      if (loc.value === undefined || loc.value.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a 'placeholder' locator with no value.`);
      }
      return `${scope}.getByPlaceholder(${tsLit(loc.value, dynamic)})`;
    case "text":
      // Confirmed live bug: a hand-authored locator that used `name` (the role_name/scoped tier's
      // field) instead of `value` here silently rendered `getByText('', { exact: true })` — a broken,
      // always-fails-or-matches-nothing locator that shipped without any validation error at all.
      // Matching the XPath tiers below (which already throw on a missing xpath), this now fails loudly
      // at `validate`/`create` time instead of writing broken generated code silently.
      if (loc.value === undefined || loc.value.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a 'text' locator with no value.`);
      }
      return `${scope}.getByText(${tsLit(loc.value, dynamic)}, { exact: true })`;
    case "scoped":
      return renderRoleChain(loc, ref, dynamic);
    case "testid_xpath":
    case "dom_id":
    case "attr_combo":
    case "sibling_text":
    case "nth":
      if (loc.xpath === undefined || loc.xpath.length === 0) {
        throw new CodegenLocatorError(`ref '${ref}' has a '${loc.strategy}' locator with no xpath expression.`);
      }
      return `${scope}.locator(${tsLit(loc.xpath, dynamic)})`;
    default:
      throw new CodegenLocatorError(`ref '${ref}' has an unrenderable locator strategy.`);
  }
}

export function deriveLocator(el: ElementDescriptor): string {
  const loc = resolveStructuredLocator(el);
  if (loc === undefined) {
    throw new CodegenLocatorError(
      `ref '${el.ref}' has no structured locator and no testid/role/name to derive one. ` +
        `Capture it with browser_read and include the element's locator.`
    );
  }
  return renderLocatorExpr(loc, el.ref, isDynamicElement(el));
}

/** The `// locator-helper:` strategy code for the comment above each generated locator field. */
export function deriveLocatorStrategy(el: ElementDescriptor): string {
  if (isDynamicElement(el)) {
    return "dyn_param";
  }
  const loc = resolveStructuredLocator(el);
  return loc?.strategy ?? "nth";
}

/**
 * Full `// locator-helper:` comment text, including the parenthetical explanation `sibling_text`
 * carries. Every other strategy is self-explanatory from its code alone; `sibling_text` isn't — the
 * element has no accessible name at all, so without the matched text a reader can't tell what a
 * position-independent XPath like this is even targeting.
 *
 * A `click_delegate` locator gets its own parenthetical regardless of strategy: this field targets a
 * click-delegate ANCESTOR, not the element the ref nominally describes (the original is
 * pointer-events:none or an effectively-zero-size sr-only input) — `.click()` is correct here, but
 * `.check()`/`.uncheck()` will throw, since the delegate is a plain container, not itself a
 * checkbox/radio. Without this, a reader (or an agent editing the generated file later) has no way to
 * tell this locator doesn't point at the input its field name implies.
 */
export function deriveLocatorHelperComment(el: ElementDescriptor): string {
  const strategy = deriveLocatorStrategy(el);
  const loc = resolveStructuredLocator(el);

  let text = strategy;
  if (strategy === "sibling_text") {
    const siblingText = loc?.strategy === "sibling_text" ? loc.value : undefined;
    if (siblingText !== undefined && siblingText.length > 0) {
      text = `sibling_text (no accessible name — matched via sibling text: "${siblingText}")`;
    }
  }
  if (loc?.click_delegate === true) {
    text += " — click-delegate ancestor: click only, check/uncheck unsupported";
  }
  return text;
}

export function deduplicateFieldNames(elements: ElementDescriptor[]): Map<string, string> {
  const fieldMap = new Map<string, string>();
  const usedNames = new Map<string, number>();

  for (const el of elements) {
    const base = deriveFieldName(el);
    const count = usedNames.get(base) ?? 0;
    const name = count === 0 ? base : `${base}${count + 1}`;
    usedNames.set(base, count + 1);
    fieldMap.set(el.ref, name);
  }

  return fieldMap;
}

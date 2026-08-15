/**
 * @file Derives a `StructuredLocator` for a single `<iframe>` HOST element — one entry in a captured
 * element's `frame_path`. Passed to `elementHandle.evaluate()` only (must stay self-contained, like
 * interactive-capture.evaluate.ts, since `fn.toString()` serialization only sends the function body).
 *
 * Deliberately narrow: an iframe is a structural boundary, not a role/text-bearing control, so only the
 * XPath-renderable tiers apply (testid → testid_xpath → dom_id → attr_combo → nth, mirroring T1/T2/T3/T6/T8
 * of interactive-capture's deriveStructuredLocator). `nth` (positional) is the guaranteed last resort —
 * same convention as every other tier in the codebase — so this never returns `undefined` for an attached
 * element; callers that want to avoid fragile positional frame paths should check `confidence === "low"`.
 */
import type { StructuredLocator } from "@vindicate/protocol";

export interface IframeHostLocatorOpts {
  readonly testidCandidates: string[];
  readonly projectTestidAttr: string;
}

/**
 * Runs in the browser via `elementHandle.evaluate()` — do not import Node built-ins here.
 */
export function deriveIframeHostLocator(
  el: Element,
  opts: IframeHostLocatorOpts
): StructuredLocator {
  /* __VINDICATE_EVAL__:iframe_host_locator__ */

  const GENERATED_ID_RE: ReadonlyArray<RegExp> = [
    /^[a-z]+-[0-9a-f]{6,}$/i,
    /^\d+$/,
    // Kept in sync with interactive-capture.evaluate.ts's GENERATED_ID_RE — see that file for why this
    // needs to match both the bare React useId() token (":r0:") and library-prefixed variants
    // ("radix-:r0:").
    /^[a-z0-9_]*-?:[a-z0-9]+:$/i
  ];

  function isGeneratedDomId(id: string): boolean {
    return GENERATED_ID_RE.some((re) => re.test(id));
  }

  // Third-party payment/security SDKs commonly assign iframe name/title values that look stable but are
  // dynamically generated per-instance — Stripe's `__privateStripeFrame47514`, `__privateStripeController1571`,
  // `__privateStripeMetricsController9130` (confirmed against a real Klarna+Stripe checkout capture — every
  // one of these ends in a run of digits that differs on every page load). A real semantic name like
  // "klarna-checkout-iframe" or "hcaptcha-invisible" never ends that way. Trusting the generated kind
  // produces a locator that resolves today but goes stale the instant the SDK remounts the iframe under a
  // new generated name — exactly the "resolved fine at capture, times out at act" failure this guards
  // against, since a captured `frame_path` is meant to keep working for the lifetime of the page, not just
  // the instant it was captured.
  const GENERATED_TRAILING_DIGITS_RE = /\d{3,}$/;

  function looksGenerated(value: string): boolean {
    return GENERATED_TRAILING_DIGITS_RE.test(value);
  }

  function findTestid(
    target: Element,
    candidates: string[]
  ): { value: string; attr: string } | null {
    for (const attr of candidates) {
      const val = target.getAttribute(attr);
      if (val !== null && val.length > 0) {
        return { value: val, attr };
      }
    }
    return null;
  }

  function escapeAttrValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function xpathLiteral(s: string): string {
    if (s.indexOf('"') === -1) return `"${s}"`;
    if (s.indexOf("'") === -1) return `'${s}'`;
    const segs = s.split('"');
    return `concat(${segs.map((seg, i) => (i < segs.length - 1 ? `"${seg}", '"'` : `"${seg}"`)).join(", ")})`;
  }

  function countByXpath(xp: string): number {
    try {
      const r = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return r.snapshotLength;
    } catch {
      return -1;
    }
  }

  function positionalXpath(target: Element): string {
    const parts: string[] = [];
    let cur: Element | null = target;
    while (cur !== null && cur.nodeType === Node.ELEMENT_NODE) {
      const node: Element = cur;
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        parts.push(`/${tag}`);
        break;
      }
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      parts.push(`/${tag}[${sameTag.indexOf(node) + 1}]`);
      if (tag === "html") break;
      cur = parent;
    }
    return parts.reverse().join("");
  }

  const tag = el.tagName.toLowerCase();
  const foundTestid = findTestid(el, opts.testidCandidates);

  // T1 — test-id on the project attribute → getByTestId
  if (foundTestid !== null && foundTestid.attr === opts.projectTestidAttr) {
    if (
      document.querySelectorAll(`[${foundTestid.attr}="${escapeAttrValue(foundTestid.value)}"]`)
        .length === 1
    ) {
      return {
        strategy: "testid",
        confidence: "high",
        attr: foundTestid.attr,
        value: foundTestid.value
      };
    }
  }
  // T2 — test-id on another recognised attribute → XPath
  if (foundTestid !== null && foundTestid.attr !== opts.projectTestidAttr) {
    const xp = `//*[@${foundTestid.attr}=${xpathLiteral(foundTestid.value)}]`;
    if (countByXpath(xp) === 1) {
      return {
        strategy: "testid_xpath",
        confidence: "high",
        attr: foundTestid.attr,
        value: foundTestid.value,
        xpath: xp
      };
    }
  }
  // T3 — stable, non-generated id → XPath
  const id = el.id;
  if (typeof id === "string" && id.length > 0 && !isGeneratedDomId(id)) {
    const xp = `//*[@id=${xpathLiteral(id)}]`;
    if (countByXpath(xp) === 1) {
      return { strategy: "dom_id", confidence: "high", value: id, xpath: xp };
    }
  }
  // T6 — unique stable attribute combination (name / title / src-prefix never used: src carries
  // session-specific query params on every real payment-widget iframe seen in practice, so it would
  // never repeat across runs — only the truly stable identity attributes apply here).
  const attrParts: string[] = [];
  const nameAttr = el.getAttribute("name");
  if (nameAttr !== null && nameAttr.length > 0 && !looksGenerated(nameAttr)) {
    attrParts.push(`@name=${xpathLiteral(nameAttr)}`);
  }
  const titleAttr = el.getAttribute("title");
  if (titleAttr !== null && titleAttr.length > 0 && !looksGenerated(titleAttr)) {
    attrParts.push(`@title=${xpathLiteral(titleAttr)}`);
  }
  if (attrParts.length > 0) {
    const xp = `//${tag}[${attrParts.join(" and ")}]`;
    if (countByXpath(xp) === 1) {
      return { strategy: "attr_combo", confidence: "high", xpath: xp };
    }
  }
  // T8 — positional last resort (always low confidence)
  return { strategy: "nth", confidence: "low", xpath: positionalXpath(el) };
}

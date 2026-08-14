/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for shadow-DOM capture: a plain TreeWalker (and XPath, and CSS — see
 * @vindicate/protocol locator.ts) cannot see or resolve into an open shadow root. Before this fix, an
 * interactive control rendered inside a Shadow-DOM web component (Ionic, Shoelace, Lit, etc.) was
 * either invisible to capture, or — worse — a same-shaped decoy element elsewhere in the light DOM
 * (e.g. a hidden native `<button type="submit">` fallback) was captured and confidently offered as
 * the target instead, producing a locator that always resolves to the wrong element.
 */
import { describe, expect, it } from "vitest";

import { captureInteractiveSnapshot } from "./interactive-capture.evaluate.js";

const baseOpts = {
  maxNodes: 100,
  testidCandidates: ["data-testid"],
  collapse: false,
  viewportOnly: false,
  includeVerifiable: false
};

/** Minimal Stencil/Ionic-shaped custom element: true shadow DOM, a native control, and a <slot> for
 * projected light-DOM text — mirrors how ion-button actually renders its "Sign In" label. */
function defineShadowButton(tagName: string): void {
  if (customElements.get(tagName) !== undefined) return;
  class ShadowButton extends HTMLElement {
    connectedCallback(): void {
      const root = this.attachShadow({ mode: "open" });
      const disabled = this.hasAttribute("disabled") ? " disabled" : "";
      const type = this.getAttribute("type") ?? "button";
      root.innerHTML = `<button type="${type}"${disabled}><span class="inner"><slot></slot></span></button>`;
    }
  }
  customElements.define(tagName, ShadowButton);
}

describe("captureInteractiveSnapshot — shadow DOM", () => {
  it("finds and correctly names a control rendered inside an open shadow root", () => {
    defineShadowButton("shadow-button-basic");
    document.body.innerHTML = `<shadow-button-basic type="submit">Sign In</shadow-button-basic>`;

    const result = captureInteractiveSnapshot(baseOpts);

    const btn = result.elements.find((e) => e.role === "button");
    expect(btn).toBeDefined();
    expect(btn?.name).toBe("Sign In");
    expect(btn?.locator?.strategy).toBe("role_name");
    expect(btn?.locator?.name).toBe("Sign In");
  });

  it("prefers the real shadow-DOM button over a hidden light-DOM decoy with the same shape", () => {
    defineShadowButton("shadow-button-decoy");
    document.body.innerHTML = `
      <form>
        <shadow-button-decoy type="submit" disabled>Sign In</shadow-button-decoy>
        <button type="submit" disabled style="display: none;"></button>
      </form>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const buttons = result.elements.filter((e) => e.role === "button");

    const real = buttons.find((b) => b.name === "Sign In");
    const decoy = buttons.find((b) => b.name === "");

    // Both are now captured and distinguishable — the agent can tell them apart by name instead of
    // only ever seeing (and confidently targeting) the hidden decoy.
    expect(real).toBeDefined();
    expect(real?.locator?.strategy).toBe("role_name");

    expect(decoy).toBeDefined();
    // happy-dom doesn't implement document.evaluate, so the XPath-checked attr_combo/nth tiers can't be
    // exercised here (a pre-existing environment gap, unrelated to this fix — see the real-browser
    // reproduction in this session's investigation, where the decoy correctly resolved via attr_combo).
    // What must hold regardless of environment: the decoy is never confused for the named real button.
    expect(decoy?.locator?.strategy).not.toBe("role_name");
  });

  it("does not use an XPath-rendered tier (dom_id) for an id'd, unnamed element inside a shadow root", () => {
    // An icon-only control: real id, no text/aria-label/testid — nothing for role_name to match either.
    // Under the old logic this would have won T3 (dom_id), producing an XPath locator that structurally
    // can never resolve at click time (Playwright's XPath engine cannot cross a shadow boundary).
    class ShadowIconButton extends HTMLElement {
      connectedCallback(): void {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<button id="real-submit" type="submit"></button>`;
      }
    }
    if (customElements.get("shadow-icon-button") === undefined) {
      customElements.define("shadow-icon-button", ShadowIconButton);
    }
    document.body.innerHTML = `<shadow-icon-button></shadow-icon-button>`;

    const result = captureInteractiveSnapshot(baseOpts);
    const btn = result.elements.find((e) => e.role === "button");

    expect(btn).toBeDefined();
    expect(btn?.locator?.strategy).not.toBe("dom_id");
    expect(btn?.locator?.strategy).not.toBe("attr_combo");
    expect(btn?.locator?.strategy).not.toBe("nth");
    // No author name and no testid here, so the only safe tier left (role_name) has nothing to match —
    // capture should honestly report "no locator" rather than fall back to a guaranteed-broken XPath.
    expect(btn?.locator).toBeUndefined();
  });

  it("still resolves a shadow-DOM element via testid (getByTestId pierces shadow roots)", () => {
    class ShadowTestidButton extends HTMLElement {
      connectedCallback(): void {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<button data-testid="submit-btn" type="submit"></button>`;
      }
    }
    if (customElements.get("shadow-testid-button") === undefined) {
      customElements.define("shadow-testid-button", ShadowTestidButton);
    }
    document.body.innerHTML = `<shadow-testid-button></shadow-testid-button>`;

    const result = captureInteractiveSnapshot(baseOpts);
    const btn = result.elements.find((e) => e.testid === "submit-btn");

    expect(btn).toBeDefined();
    expect(btn?.locator?.strategy).toBe("testid");
  });

  it("leaves ordinary light-DOM pages (no shadow root anywhere) unaffected", () => {
    document.body.innerHTML = `
      <input id="email" type="email">
      <button type="submit">Sign In</button>
    `;

    const result = captureInteractiveSnapshot(baseOpts);
    const input = result.elements.find((e) => e.tag === "input");
    const btn = result.elements.find((e) => e.tag === "button");

    // Every gate this fix adds is conditioned on `isInShadowDom(el)`, which is always false for pure
    // light-DOM elements — so their tier selection is provably untouched by this change.
    expect(input?.locator).toBeDefined();
    expect(btn?.locator?.strategy).toBe("role_name");
    expect(btn?.name).toBe("Sign In");
  });
});

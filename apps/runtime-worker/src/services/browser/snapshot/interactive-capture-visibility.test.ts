/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for the "not visible" signal — added after a live trial against
 * https://demo.kustom.co/ found two structurally-identical "Card number" textboxes on the same
 * checkout page (same role/name/type), one a third-party payment SDK's pre-mounted-but-hidden card
 * iframe, one the real, user-facing one revealed once "Credit or debit card" is actually selected.
 * `browser_read` had no signal distinguishing them; an agent picking the hidden one produced a
 * locator that could resolve to a stale/torn-down frame later. This is deliberately distinct from
 * `in_viewport` (pure viewport-bounds geometry, unaffected by opacity/visibility/display — a hidden
 * but still-laid-out element reports in-viewport same as a visible one).
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

describe("captureInteractiveSnapshot — not-visible signal", () => {
  it("omits `visible` entirely for a normal, visible control (silent-when-true)", () => {
    document.body.innerHTML = `<button data-testid="save">Save</button>`;
    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.role === "button");
    expect(button?.visible).toBeUndefined();
  });

  it("flags display:none on the element itself", () => {
    document.body.innerHTML = `<button data-testid="hidden-btn" style="display:none;">Hidden</button>`;
    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.testid === "hidden-btn");
    expect(button?.visible).toBe(false);
  });

  it("flags visibility:hidden on the element itself", () => {
    document.body.innerHTML = `<button data-testid="hidden-btn" style="visibility:hidden;">Hidden</button>`;
    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.testid === "hidden-btn");
    expect(button?.visible).toBe(false);
  });

  it("flags opacity:0 on the element itself", () => {
    document.body.innerHTML = `<button data-testid="hidden-btn" style="opacity:0;">Hidden</button>`;
    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.testid === "hidden-btn");
    expect(button?.visible).toBe(false);
  });

  it("does not flag partial opacity — only exactly 0 counts as hidden", () => {
    document.body.innerHTML = `<button data-testid="faded-btn" style="opacity:0.4;">Faded</button>`;
    const result = captureInteractiveSnapshot(baseOpts);
    const button = result.elements.find((e) => e.testid === "faded-btn");
    expect(button?.visible).toBeUndefined();
  });

  it("flags an element hidden via an ANCESTOR wrapper, not its own style (the real pre-mount pattern)", () => {
    // getComputedStyle(el) alone never sees a hiding ancestor's own declared style — this is exactly
    // why the check walks ancestors like isAriaHiddenAncestor does, instead of only checking `el`.
    document.body.innerHTML = `
      <div style="opacity:0;">
        <input data-testid="card-number" placeholder="Card number">
      </div>
    `;
    const result = captureInteractiveSnapshot(baseOpts);
    const input = result.elements.find((e) => e.testid === "card-number");
    expect(input?.visible).toBe(false);
  });

  it("flags an element under a display:none ancestor several levels up", () => {
    document.body.innerHTML = `
      <div style="display:none;">
        <div><div>
          <input data-testid="card-number" placeholder="Card number">
        </div></div>
      </div>
    `;
    const result = captureInteractiveSnapshot(baseOpts);
    const input = result.elements.find((e) => e.testid === "card-number");
    expect(input?.visible).toBe(false);
  });

  it("distinguishes two structurally-identical candidates for the same name — the actual duplicate-iframe scenario", () => {
    // Same role/name/type on both — only the visibility signal (and, in real capture, frame_path)
    // tells them apart. This mirrors the exact kustom.co shape: a hidden pre-mount widget and a
    // visible real one, both exposing a "Card number" textbox.
    document.body.innerHTML = `
      <div style="opacity:0;">
        <input role="textbox" aria-label="Card number" data-testid="stale-card-number">
      </div>
      <div>
        <input role="textbox" aria-label="Card number" data-testid="live-card-number">
      </div>
    `;
    const result = captureInteractiveSnapshot(baseOpts);
    const stale = result.elements.find((e) => e.testid === "stale-card-number");
    const live = result.elements.find((e) => e.testid === "live-card-number");

    expect(stale?.visible).toBe(false);
    expect(live?.visible).toBeUndefined();
  });
});

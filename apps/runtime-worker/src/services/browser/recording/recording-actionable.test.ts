/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import {
  findTestidOnElement,
  isActionableElement,
  isInteractiveElement,
  resolveActionableElement
} from "./recording-actionable.js";

const TESTID_CANDIDATES = ["data-testid", "data-cy", "e2e"];

describe("resolveActionableElement", () => {
  it("resolves span click inside button to the button", () => {
    document.body.innerHTML = `<button type="submit"><span>Login</span></button>`;
    const span = document.querySelector("span")!;
    const button = document.querySelector("button")!;
    expect(resolveActionableElement(span, TESTID_CANDIDATES)).toBe(button);
  });

  it("resolves span click to button with data-cy test id", () => {
    document.body.innerHTML = `<button data-cy="login"><span>Login</span></button>`;
    const span = document.querySelector("span")!;
    const button = document.querySelector("button")!;
    expect(resolveActionableElement(span, TESTID_CANDIDATES)).toBe(button);
  });

  it("returns null for click on non-actionable background", () => {
    document.body.innerHTML = `<main><p>Hello</p></main>`;
    const p = document.querySelector("p")!;
    expect(resolveActionableElement(p, TESTID_CANDIDATES)).toBeNull();
  });

  it("treats testid-only div as actionable", () => {
    document.body.innerHTML = `<div data-testid="card"><span>Title</span></div>`;
    const span = document.querySelector("span")!;
    const card = document.querySelector("div")!;
    expect(resolveActionableElement(span, TESTID_CANDIDATES)).toBe(card);
  });

  it("treats role=button div as actionable", () => {
    document.body.innerHTML = `<div role="button">Custom</div>`;
    const div = document.querySelector("div")!;
    expect(isInteractiveElement(div)).toBe(true);
    expect(resolveActionableElement(div, TESTID_CANDIDATES)).toBe(div);
  });

  it("falls back to the cursor:pointer delegate itself when a real click event targets it directly", () => {
    // Mirrors a real production case: a custom multi-select row (cursor:pointer, framework click
    // binding) wraps a role=checkbox that itself has pointer-events:none. In a real browser, the
    // pointer-events:none checkbox is invisible to hit-testing, so a real click's event.target is
    // already `.ms-option` itself — resolveActionableElement is called with that as `el`. `.ms-option`
    // has none of the primary tag/role/tabindex/onclick signals, so without the cursor:pointer fallback
    // the walk would find nothing at all and the click would be silently dropped.
    document.body.innerHTML = `
      <div class="ms-option" style="cursor: pointer;">
        <span role="checkbox" tabindex="0" style="pointer-events: none;"></span>
        <span>GAY EVENT</span>
      </div>
    `;
    const delegate = document.querySelector(".ms-option")!;
    expect(resolveActionableElement(delegate, TESTID_CANDIDATES)).toBe(delegate);
  });

  it("does not use the cursor:pointer fallback when a real actionable element is found first", () => {
    // A real button directly inside an unrelated cursor:pointer card must still resolve to the button
    // itself — the fallback must never override a closer, more specific match.
    document.body.innerHTML = `
      <div class="card" style="cursor: pointer;">
        <button id="real-btn" type="button">Real Button</button>
      </div>
    `;
    const button = document.querySelector("button")!;
    expect(resolveActionableElement(button, TESTID_CANDIDATES)).toBe(button);
  });

  it("does not fall back to an element that is itself pointer-events:none, even with cursor:pointer", () => {
    // Explicit on the element under test rather than relying on CSS inheritance down from an ancestor —
    // happy-dom's getComputedStyle does not propagate inherited pointer-events the way a real browser
    // does (confirmed empirically), so this is the only reliable way to exercise this guard here.
    document.body.innerHTML = `
      <main>
        <div style="cursor: pointer; pointer-events: none;">plain text</div>
      </main>
    `;
    const blockedDiv = document.querySelector("div")!;
    expect(resolveActionableElement(blockedDiv, TESTID_CANDIDATES)).toBeNull();
  });

  it("still returns null when nothing actionable and no cursor:pointer ancestor exists", () => {
    document.body.innerHTML = `<main><p>Hello</p></main>`;
    const p = document.querySelector("p")!;
    expect(resolveActionableElement(p, TESTID_CANDIDATES)).toBeNull();
  });
});

describe("findTestidOnElement", () => {
  it("finds e2e attribute from candidate list", () => {
    document.body.innerHTML = `<button e2e="save">Save</button>`;
    const button = document.querySelector("button")!;
    expect(findTestidOnElement(button, TESTID_CANDIDATES)).toEqual({
      value: "save",
      attr: "e2e"
    });
  });
});

describe("isActionableElement", () => {
  it("returns false for plain div without test id", () => {
    document.body.innerHTML = `<div>static</div>`;
    const div = document.querySelector("div")!;
    expect(isActionableElement(div, TESTID_CANDIDATES)).toBe(false);
  });
});

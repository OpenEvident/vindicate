/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";

import { captureRecordingPageSnapshot } from "./recording-page-snapshot.evaluate.js";

describe("captureRecordingPageSnapshot", () => {
  it("captures interactive elements with full selector candidates", () => {
    document.body.innerHTML = `
      <input data-testid="email" type="email" placeholder="Email" aria-invalid="true" value="bad@x.com" />
      <button id="login-btn">Login</button>
      <div role="alert">Invalid credentials</div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });

    expect(result.url).toBeTruthy();
    expect(result.alerts).toContain("Invalid credentials");
    expect(result.elements.length).toBeGreaterThanOrEqual(2);

    const email = result.elements.find((el) =>
      el.candidates.some((c) => c.strategy === "testid" && c.value === "email")
    );
    expect(email).toBeDefined();
    expect(email?.value).toBe("bad@x.com");
    expect(email?.aria_invalid).toBe(true);
    expect(email?.candidates.some((c) => c.strategy === "testid")).toBe(true);
    expect(email?.candidates.some((c) => c.strategy === "attr_combo")).toBe(true);
    expect(email?.candidates.some((c) => c.strategy === "nth")).toBe(true);
    expect(email?.candidates.some((c) => c.strategy === "css")).toBe(false);
    expect(email?.chosen?.strategy).toBe("testid");

    const login = result.elements.find((el) => el.element.id === "login-btn");
    expect(login?.candidates.length).toBeGreaterThanOrEqual(3);
    expect(login?.chosen).not.toBeNull();
  });

  it("skips recorder overlay elements", () => {
    document.body.innerHTML = `
      <div id="__vindicate-recorder-host"><button>Stop</button></div>
      <button id="real">Go</button>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    expect(result.elements.every((el) => el.element.id !== undefined || el.name === "Go")).toBe(
      true
    );
    expect(result.elements.some((el) => el.name === "Stop")).toBe(false);
  });

  it("offers a sibling_text candidate for a nameless checkbox with one text-bearing sibling", () => {
    document.body.innerHTML = `
      <div class="event-type-row">
        <input type="checkbox">
        <span>GAY EVENT</span>
      </div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.tag === "input");

    expect(checkbox?.name).toBe("");
    const siblingCandidate = checkbox?.candidates.find((c) => c.strategy === "sibling_text");
    expect(siblingCandidate).toBeDefined();
    expect(siblingCandidate?.value).toBe(
      '//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]'
    );
    // Here `<input type="checkbox">` also yields an attr_combo candidate (@type="checkbox"), which
    // legitimately outranks sibling_text — this only proves the fallback candidate is offered alongside
    // it, not that it wins. See the next test for a case where it's actually chosen.
    expect(checkbox?.chosen?.strategy).toBe("attr_combo");
  });

  it("chooses sibling_text when it is the only tier that resolves at all (no type/name/id attrs)", () => {
    document.body.innerHTML = `
      <div class="event-type-row">
        <div role="checkbox" tabindex="0"></div>
        <span>GAY EVENT</span>
      </div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.role === "checkbox");

    expect(checkbox?.name).toBe("");
    expect(checkbox?.candidates.some((c) => c.strategy === "attr_combo")).toBe(false);
    expect(checkbox?.chosen?.strategy).toBe("sibling_text");
  });

  it("does not offer a sibling_text candidate when the control already has an accessible name", () => {
    document.body.innerHTML = `
      <div>
        <input type="checkbox" aria-label="Marketing emails">
        <span>Unrelated helper text</span>
      </div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.tag === "input");

    expect(checkbox?.name).toBe("Marketing emails");
    expect(checkbox?.candidates.some((c) => c.strategy === "sibling_text")).toBe(false);
  });

  it("derives candidates from the click delegate when the control itself is pointer-events:none", () => {
    document.body.innerHTML = `
      <div class="ms-option" style="cursor: pointer;">
        <span role="checkbox" tabindex="0" style="pointer-events: none;"></span>
        <span>GAY EVENT</span>
      </div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.role === "checkbox");

    expect(checkbox).toBeDefined();
    // Reported identity stays the checkbox's own.
    expect(checkbox?.role).toBe("checkbox");
    expect(checkbox?.tag).toBe("span");
    expect(checkbox?.name).toBe("");
    expect(checkbox?.click_delegate).toBe(true);
    expect(checkbox?.chosen?.strategy).toBe("text");
    expect(checkbox?.chosen?.value).toBe("GAY EVENT");
  });

  it("offers no candidates at all when no click-delegate ancestor exists (never a broken locator)", () => {
    document.body.innerHTML = `
      <div class="plain-wrapper">
        <span role="checkbox" tabindex="0" style="pointer-events: none;"></span>
        <span>ORPHANED</span>
      </div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.role === "checkbox");

    expect(checkbox).toBeDefined();
    expect(checkbox?.click_delegate).toBeUndefined();
    expect(checkbox?.candidates).toEqual([]);
    expect(checkbox?.chosen).toBeNull();
  });

  it("leaves a normal (non-blocked) checkbox completely unaffected by the delegate fallback", () => {
    document.body.innerHTML = `
      <div><input type="checkbox" id="normal-cb"><label for="normal-cb">Marketing emails</label></div>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const checkbox = result.elements.find((el) => el.name === "Marketing emails");

    expect(checkbox?.click_delegate).toBeUndefined();
    expect(checkbox?.chosen?.strategy).toBe("dom_id");
  });

  it("derives candidates from the click delegate when the control is collapsed to 1x1px (sr-only pattern)", () => {
    // Confirmed as the actual cause of a real production timeout, reproduced live against
    // https://demo.kustom.co/'s Klarna checkout: a "Credit or debit card" payment radio with
    // class="sr-only", pointer-events:auto, computed width/height "1px"/"1px" — see
    // interactive-capture-zero-size-delegate.test.ts for the full writeup.
    document.body.innerHTML = `
      <label style="cursor: pointer;">
        <input type="radio" data-testid="payment-method-card-container"
               style="width:1px;height:1px;overflow:hidden;position:absolute;pointer-events:auto;">
        <span>Credit or debit card</span>
      </label>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const radio = result.elements.find((el) => el.tag === "input");

    expect(radio).toBeDefined();
    expect(radio?.click_delegate).toBe(true);
    expect(radio?.chosen?.strategy).toBe("text");
    expect(radio?.chosen?.value).toBe("Credit or debit card");
  });

  it("leaves an explicitly-sized-but-real control unaffected by the zero-size trigger", () => {
    document.body.innerHTML = `
      <button type="button" style="width:40px;height:40px;">Real Button</button>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const button = result.elements.find((el) => el.tag === "button");

    expect(button?.click_delegate).toBeUndefined();
  });

  it("text candidate does not insert a synthetic space between adjacent block-level children (the real Klarna case)", () => {
    // Reproduces the exact real DOM this was diagnosed against: two adjacent <div>s with no whitespace
    // text node between them (React-rendered — no JSX literal whitespace). Verified live against
    // https://demo.kustom.co/'s Klarna checkout: getByText(value, {exact:true}) using the space-joined
    // accessible-name-style value (the pre-fix behaviour) matched zero elements; only the unspaced
    // concatenation this test pins actually resolves.
    document.body.innerHTML =
      '<label style="cursor: pointer;">' +
      '<input type="radio" data-testid="payment-method-card-container" ' +
      'style="width:1px;height:1px;overflow:hidden;position:absolute;pointer-events:auto;">' +
      "<div>Credit or debit card</div><div>Secure and encrypted</div>" +
      "</label>";

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const radio = result.elements.find((el) => el.tag === "input");

    expect(radio?.click_delegate).toBe(true);
    expect(radio?.chosen?.strategy).toBe("text");
    expect(radio?.chosen?.value).toBe("Credit or debit cardSecure and encrypted");
  });

  it("role_name candidate still space-joins the same as before (getByRole path unaffected)", () => {
    // Regression guard for the pre-existing "ColomboColombo District" fix this must not undo:
    // role_name (getByRole matching) still needs the ARIA-accessible-name-style space-joined value.
    document.body.innerHTML =
      "<button><span>Colombo</span><span>Colombo District, Sri Lanka</span></button>";

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const btn = result.elements.find((el) => el.tag === "button");
    const roleNameCandidate = btn?.candidates.find((c) => c.strategy === "role_name");

    expect(roleNameCandidate?.value).toBe('button[name="Colombo Colombo District, Sri Lanka"]');
  });

  it("uses the ARIA implicit role for a scoped candidate's container, never the raw tag name", () => {
    // <tr>'s implicit role is "row", not "tr" — getByRole('tr', ...) matches nothing in a real browser.
    // A real, pre-existing bug fixed alongside the click-delegate work.
    document.body.innerHTML = `
      <table><tr><td>Product ABC</td><td><button type="button">Delete</button></td></tr></table>
    `;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const scopedCandidate = result.elements
      .flatMap((el) => el.candidates)
      .find((c) => c.strategy === "scoped");

    expect(scopedCandidate?.container?.role).toBe("row");
    expect(scopedCandidate?.container?.role).not.toBe("tr");
  });

  it("reports the ARIA implicit role for a role-less element's metadata, never the raw tag name", () => {
    document.body.innerHTML = `<ul><li>Item text<button type="button">Remove</button></li></ul>`;

    const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
    const scopedCandidate = result.elements
      .flatMap((el) => el.candidates)
      .find((c) => c.strategy === "scoped");

    expect(scopedCandidate?.container?.role).toBe("listitem");
  });

  describe("nth (XPath) candidate for a testid containing a double quote", () => {
    // Regression coverage for the incomplete-sanitization fix: getXPath used to build
    // `//*[@${attr}="${value.replace(/"/g, '\\"')}"]` by hand — XPath 1.0 string literals have no
    // escape mechanism at all, so that backslash-quote sequence isn't actually meaningful XPath
    // syntax; it just closes the string early on any value containing a quote. The fix reuses this
    // file's own xpathLiteral() helper, which switches to single-quote delimiters (or falls back
    // to concat() when a value has both quote types) instead of trying to escape.
    it("switches to single-quote delimiters instead of producing invalid XPath", () => {
      document.body.innerHTML = "";
      const el = document.createElement("button");
      el.setAttribute("data-testid", 'foo"bar');
      el.textContent = "Click me";
      document.body.appendChild(el);

      const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
      const nthCandidate = result.elements
        .flatMap((e) => e.candidates)
        .find((c) => c.strategy === "nth");

      expect(nthCandidate?.value).toBe(`//*[@data-testid='foo"bar']`);
      // The old escaping would have produced this instead — assert we've actually moved off it.
      expect(nthCandidate?.value).not.toBe(`//*[@data-testid="foo\\"bar"]`);
    });

    it("falls back to concat() when the value contains both quote types", () => {
      document.body.innerHTML = "";
      const el = document.createElement("button");
      el.setAttribute("data-testid", `foo"bar'baz`);
      el.textContent = "Click me";
      document.body.appendChild(el);

      const result = captureRecordingPageSnapshot({ testidCandidates: ["data-testid"] });
      const nthCandidate = result.elements
        .flatMap((e) => e.candidates)
        .find((c) => c.strategy === "nth");

      expect(nthCandidate?.value).toBe(`//*[@data-testid=concat("foo", '"', "bar'baz")]`);
    });
  });
});

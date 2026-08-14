import { describe, expect, it } from "vitest";

import { BROWSER_READ_CHAR_BUDGET, formatSnapshot } from "../../src/mcp/tools/browser-read-tool.js";

describe("formatSnapshot", () => {
  it("renders compact ARIA lines with flags and alerts", () => {
    const text = formatSnapshot({
      snapshot_id: 3,
      url: "https://app.com/new",
      title: "New Product",
      elements: [
        {
          ref: "ref-a1b2c3d4",
          role: "button",
          name: "Save",
          testid: "save-btn",
          aria_required: false,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        },
        {
          ref: "ref-e5f6a7b8",
          role: "textbox",
          name: "Product name",
          value: "Headphones",
          aria_required: true,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        }
      ],
      alerts: ["Name is required"]
    });

    expect(text).toContain('page: New Product — https://app.com/new');
    expect(text).toContain('button "Save" @ref-a1b2c3d4 [testid=save-btn]');
    expect(text).toContain('textbox "Product name" (Headphones) @ref-e5f6a7b8 [required]');
    expect(text).toContain('⚠️ 1 alert(s): "Name is required"');
    expect(text).toContain("snapshot_id: 3");
  });

  it("appends a 'via <strategy>' badge and a live-region assert hint", () => {
    const text = formatSnapshot({
      snapshot_id: 5,
      url: "https://app.com/login",
      title: "Login",
      elements: [
        {
          ref: "ref-btn",
          role: "button",
          name: "Login",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "button", name: "Login" }
        },
        {
          ref: "ref-alert",
          role: "alert",
          name: "Invalid credentials",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          // role-only: capture left the name off because alert text is content, not a role name.
          locator: { strategy: "role_name", confidence: "low", role: "alert" }
        },
        {
          ref: "ref-row",
          role: "button",
          name: "Delete",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "nth", confidence: "low", xpath: "(//button)[3]" }
        }
      ]
    });

    expect(text).toContain('button "Login" @ref-btn [via role+name]');
    expect(text).toContain('alert "Invalid credentials" @ref-alert [via role — assert text with toContainText]');
    expect(text).toContain('button "Delete" @ref-row [via nth, low confidence]');
  });

  it("shows the matched sibling text in the badge for a nameless sibling_text element", () => {
    const text = formatSnapshot({
      snapshot_id: 6,
      url: "https://app.com/events",
      title: "Add Event",
      elements: [
        {
          ref: "ref-checkbox",
          role: "checkbox",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: false,
          aria_invalid: null,
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "GAY EVENT",
            xpath: '//input[preceding-sibling::*[normalize-space()="GAY EVENT"]]'
          }
        }
      ]
    });

    expect(text).toContain('checkbox "" @ref-checkbox [via sibling text: "GAY EVENT"]');
  });

  it("proactively warns when an element has no locator at all, instead of showing no badge", () => {
    const text = formatSnapshot({
      snapshot_id: 7,
      url: "https://app.com/widget",
      title: "Widget",
      elements: [
        {
          ref: "ref-unreachable",
          role: "button",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
          // no `locator` at all — capture genuinely found nothing safe (e.g. shadow-DOM, no name).
        }
      ]
    });

    expect(text).toContain(
      'button "" @ref-unreachable [no locator — cannot be reliably automated]'
    );
  });

  it("shows the click-only hint for a click-delegate element, alongside its via badge", () => {
    const text = formatSnapshot({
      snapshot_id: 8,
      url: "https://app.com/events",
      title: "Add Event",
      elements: [
        {
          ref: "ref-delegate-checkbox",
          role: "checkbox",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: false,
          aria_invalid: null,
          click_delegate: true,
          locator: { strategy: "text", confidence: "high", value: "GAY EVENT" }
        }
      ]
    });

    expect(text).toContain(
      'checkbox "" @ref-delegate-checkbox [via text: "GAY EVENT" — click only — check/uncheck unsupported]'
    );
  });

  it("shows a 'not visible' badge for an element flagged visible:false", () => {
    const text = formatSnapshot({
      snapshot_id: 13,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-stale-card-number",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          visible: false,
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
        }
      ]
    });

    expect(text).toContain('textbox "Card number" @ref-stale-card-number [via role+name — not visible]');
  });

  it("omits the 'not visible' badge when visible is absent (the common case)", () => {
    const text = formatSnapshot({
      snapshot_id: 13,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-live-card-number",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
        }
      ]
    });

    expect(text).not.toContain("not visible");
  });

  it("distinguishes two structurally-identical elements — one hidden, one live — via the badge", () => {
    // The actual duplicate-iframe scenario: same role/name/frame_path shape, only visibility differs.
    const framePath = [{ strategy: "dom_id" as const, confidence: "high" as const, value: "klarna-checkout-iframe", xpath: '//*[@id="klarna-checkout-iframe"]' }];
    const text = formatSnapshot({
      snapshot_id: 13,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-stale",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          visible: false,
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number", frame_path: framePath }
        },
        {
          ref: "ref-live",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number", frame_path: framePath }
        }
      ]
    });

    expect(text).toContain('@ref-stale [via role+name — not visible — in iframe: id=klarna-checkout-iframe]');
    expect(text).toContain('@ref-live [via role+name — in iframe: id=klarna-checkout-iframe]');
  });

  it("shows a 'replaces' badge for an element flagged supersedes_ref", () => {
    const text = formatSnapshot({
      snapshot_id: 15,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-new-card-number",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          supersedes_ref: "ref-old-card-number",
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
        }
      ]
    });

    expect(text).toContain(
      'textbox "Card number" @ref-new-card-number [via role+name — replaces @ref-old-card-number — prefer this one]'
    );
  });

  it("omits the 'replaces' badge when supersedes_ref is absent (the common case)", () => {
    const text = formatSnapshot({
      snapshot_id: 15,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-card-number",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "textbox", name: "Card number" }
        }
      ]
    });

    expect(text).not.toContain("replaces @");
  });

  it("flags two same-named elements with different roles — the real cart-drawer 'Checkout' link/button case", () => {
    const text = formatSnapshot({
      snapshot_id: 3,
      url: "https://demo.kustom.co/",
      title: "Demo store",
      elements: [
        {
          ref: "ref-checkout-link",
          role: "link",
          name: "Checkout",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "link", name: "Checkout" }
        },
        {
          ref: "ref-checkout-toggle",
          role: "button",
          name: "Checkout",
          aria_required: null,
          aria_expanded: true,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "button", name: "Checkout" }
        }
      ]
    });

    expect(text).toContain(
      'link "Checkout" @ref-checkout-link [via role+name — same name as @ref-checkout-toggle (button) — verify which is the real target]'
    );
    expect(text).toContain(
      'button "Checkout" @ref-checkout-toggle [expanded] [via role+name — same name as @ref-checkout-link (link) — verify which is the real target]'
    );
  });

  it("does not flag same-named elements that share the same role (not the target case — see supersedes_ref/visible instead)", () => {
    const text = formatSnapshot({
      snapshot_id: 3,
      url: "https://demo.kustom.co/",
      title: "Demo store",
      elements: [
        {
          ref: "ref-a",
          role: "link",
          name: "Women",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "link", name: "Women" }
        },
        {
          ref: "ref-b",
          role: "link",
          name: "Women",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "nth", confidence: "low", xpath: "(//a)[3]" }
        }
      ]
    });

    expect(text).not.toContain("same name as");
  });

  it("does not flag same-named-different-role elements that have no accessible name (too noisy a grouping key)", () => {
    const text = formatSnapshot({
      snapshot_id: 3,
      url: "https://demo.kustom.co/",
      title: "Demo store",
      elements: [
        {
          ref: "ref-a",
          role: "generic",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        },
        {
          ref: "ref-b",
          role: "button",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        }
      ]
    });

    expect(text).not.toContain("same name as");
  });

  it("lists one representative ref per other distinct role when 3+ roles share a name", () => {
    const text = formatSnapshot({
      snapshot_id: 3,
      url: "https://demo.kustom.co/",
      title: "Demo store",
      elements: [
        {
          ref: "ref-link",
          role: "link",
          name: "Details",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "link", name: "Details" }
        },
        {
          ref: "ref-button",
          role: "button",
          name: "Details",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "button", name: "Details" }
        },
        {
          ref: "ref-tab",
          role: "tab",
          name: "Details",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "role_name", confidence: "high", role: "tab", name: "Details" }
        }
      ]
    });

    expect(text).toContain("same name as @ref-button (button), @ref-tab (tab) — verify which is the real target");
  });

  it("shows an 'in iframe' hint for an element resolved through one frame_path hop", () => {
    const text = formatSnapshot({
      snapshot_id: 14,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-email",
          role: "textbox",
          name: "Email address",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "textbox",
            name: "Email address",
            frame_path: [{ strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" }]
          }
        }
      ]
    });

    expect(text).toContain(
      'textbox "Email address" @ref-email [via role+name — in iframe: id=klarna-checkout-iframe]'
    );
  });

  it("shows a 'nested iframe ×N' hint when frame_path has more than one hop", () => {
    const text = formatSnapshot({
      snapshot_id: 15,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-pay-klarna",
          role: "button",
          name: "Pay with Klarna",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "button",
            name: "Pay with Klarna",
            frame_path: [
              { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" },
              { strategy: "nth", confidence: "low", xpath: "/html/body/iframe[1]" }
            ]
          }
        }
      ]
    });

    expect(text).toContain(
      'button "Pay with Klarna" @ref-pay-klarna [via role+name — in nested iframe ×2: ' +
        "id=klarna-checkout-iframe > positional, low confidence]"
    );
  });

  it("shows an attr_combo hop's xpath in the badge (nested Stripe-style iframe inside a named host)", () => {
    // Regression guard for the demo.kustom.co checkout bug: codegen hand-authored two identical
    // page-level title="Secure payment input frame" hops because the badge gave no way to see that
    // the real hierarchy is a dom_id-identified Klarna host with a distinct attr_combo Stripe host
    // nested inside it.
    const text = formatSnapshot({
      snapshot_id: 16,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      elements: [
        {
          ref: "ref-card-number",
          role: "textbox",
          name: "Card number",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "textbox",
            name: "Card number",
            frame_path: [
              { strategy: "dom_id", confidence: "high", value: "klarna-checkout-iframe" },
              { strategy: "attr_combo", confidence: "high", xpath: '//iframe[@title="Secure payment input frame"]' }
            ]
          }
        }
      ]
    });

    expect(text).toContain(
      'textbox "Card number" @ref-card-number [via role+name — in nested iframe ×2: ' +
        'id=klarna-checkout-iframe > //iframe[@title="Secure payment input frame"]]'
    );
  });

  it("shows the matched text in the badge for a nameless 'text'-strategy element (not click-delegate)", () => {
    // Regression guard: a role-less element with no aria-label/placeholder falls to the "text" tier using
    // its own visible text as the locator value — the row's own accessible `name` stays empty (that's why
    // the tier exists at all), so the matched value must appear in the badge or the agent has no way to
    // tell which element is which.
    const text = formatSnapshot({
      snapshot_id: 13,
      url: "https://app.com/events",
      title: "Add Event",
      elements: [
        {
          ref: "ref-plain-text",
          role: "generic",
          name: "",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "text", confidence: "high", value: "STRAIGHT EVENT" }
        }
      ]
    });

    expect(text).toContain('generic "" @ref-plain-text [via text: "STRAIGHT EVENT"]');
  });

  it("surfaces a non-default input type so unlabeled fields stay distinguishable", () => {
    const text = formatSnapshot({
      snapshot_id: 4,
      url: "https://app.com/login",
      title: "Login",
      elements: [
        {
          ref: "ref-email",
          role: "textbox",
          name: "",
          type: "email",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        },
        {
          ref: "ref-password",
          role: "textbox",
          name: "",
          type: "password",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        },
        {
          ref: "ref-plain",
          role: "textbox",
          name: "Search",
          type: "text",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        }
      ]
    });

    expect(text).toContain('textbox "" (type=email) @ref-email');
    expect(text).toContain('textbox "" (type=password) @ref-password');
    expect(text).toContain('textbox "Search" @ref-plain');
    expect(text).not.toContain("type=text");
  });

  it("suppresses a redundant 'via testid' when the [testid=…] badge is already shown", () => {
    const text = formatSnapshot({
      snapshot_id: 6,
      url: "https://app.com/form",
      title: "Form",
      elements: [
        {
          ref: "ref-save",
          role: "button",
          name: "Save",
          testid: "save-btn",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "testid", confidence: "high", attr: "data-testid", value: "save-btn" }
        }
      ]
    });

    expect(text).toContain('button "Save" @ref-save [testid=save-btn]');
    expect(text).not.toContain("via testid");
  });

  it("keeps the live-region assert hint even when the via badge is suppressed", () => {
    const text = formatSnapshot({
      snapshot_id: 7,
      url: "https://app.com/form",
      title: "Form",
      elements: [
        {
          ref: "ref-status",
          role: "status",
          name: "Saved",
          testid: "save-status",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null,
          locator: { strategy: "testid", confidence: "high", attr: "data-testid", value: "save-status" }
        }
      ]
    });

    expect(text).toContain('status "Saved" @ref-status [testid=save-status] [assert text with toContainText]');
    expect(text).not.toContain("via testid");
  });

  it("announces a modal overlay as the first line after the page header", () => {
    const text = formatSnapshot({
      snapshot_id: 8,
      url: "https://booking.com/",
      title: "Booking",
      overlay_active: {
        ref: "ref-promo",
        role: "dialog",
        name: "Window offering discounts of 10% or more when you sign in to Booking.com",
        modal: true
      },
      elements: [
        {
          ref: "ref-dismiss",
          role: "button",
          name: "Dismiss sign-in info.",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        }
      ]
    });

    const lines = text.split("\n");
    expect(lines[0]).toBe("page: Booking — https://booking.com/");
    expect(lines[1]).toBe(
      '⚠️ modal open: dialog "Window offering discounts of 10% or more when you sign in to Booking.com" @ref-promo — page is blocked; act inside it or dismiss it, then re-read'
    );
  });

  it("clamps an over-long overlay name in the banner", () => {
    const longName = "A".repeat(120);
    const text = formatSnapshot({
      snapshot_id: 11,
      url: "https://app.com/",
      title: "App",
      overlay_active: { ref: "ref-d", role: "dialog", name: longName, modal: true },
      elements: []
    });

    const banner = text.split("\n").find((l) => l.startsWith("⚠️ modal open:"));
    expect(banner).toContain(`"${"A".repeat(79)}…"`);
    expect(banner).not.toContain("A".repeat(81));
  });

  it("announces a non-modal overlay with scope/dismiss guidance", () => {
    const text = formatSnapshot({
      snapshot_id: 10,
      url: "https://app.com/",
      title: "App",
      overlay_active: { ref: "ref-menu", role: "menu", name: "Account", modal: false },
      elements: []
    });

    expect(text).toContain('⚠️ overlay open: menu "Account" @ref-menu — scope into it or dismiss it, then re-read');
  });

  it("uses blocking guidance when overlay is marked modal", () => {
    const text = formatSnapshot({
      snapshot_id: 12,
      url: "https://app.com/",
      title: "App",
      overlay_active: { ref: "ref-alert", role: "alertdialog", name: "Session timeout warning", modal: true },
      elements: []
    });

    expect(text).toContain('⚠️ modal open: alertdialog "Session timeout warning" @ref-alert — page is blocked; act inside it or dismiss it, then re-read');
  });

  it("announces other open tabs as an early banner — a payment/login popup a click just opened", () => {
    const text = formatSnapshot({
      snapshot_id: 13,
      url: "https://demo.kustom.co/checkout/",
      title: "Checkout",
      other_tabs: { count: 1, urls: ["https://login.klarna.com/oauth2/auth?x=1"] },
      elements: []
    });

    const lines = text.split("\n");
    expect(lines[0]).toBe("page: Checkout — https://demo.kustom.co/checkout/");
    expect(lines[1]).toContain('⚠️ 1 other tab(s) open: "https://login.klarna.com/oauth2/auth?x=1"');
    expect(lines[1]).toContain("browser_navigate switch_to_url:");
  });

  it("shows a '+N more' suffix when the true tab count exceeds the listed URLs", () => {
    const text = formatSnapshot({
      snapshot_id: 14,
      url: "https://app.com/",
      title: "App",
      other_tabs: { count: 8, urls: ["https://app.com/a", "https://app.com/b"] },
      elements: []
    });

    expect(text).toContain('⚠️ 8 other tab(s) open: "https://app.com/a", "https://app.com/b" (+6 more)');
  });

  it("shows both the modal and other-tabs banners together, modal first", () => {
    const text = formatSnapshot({
      snapshot_id: 15,
      url: "https://app.com/",
      title: "App",
      overlay_active: { ref: "ref-d", role: "dialog", name: "Confirm", modal: true },
      other_tabs: { count: 1, urls: ["https://pay.example.com/"] },
      elements: []
    });

    const lines = text.split("\n");
    expect(lines[1]).toContain("modal open");
    expect(lines[2]).toContain("other tab(s) open");
  });

  it("passes through worker truncation_warning", () => {
    const text = formatSnapshot({
      snapshot_id: 1,
      url: "https://app.com/",
      title: "Big",
      truncation_warning: "⚠️ page has 600 interactive nodes — showing top 500",
      elements: [{ ref: "ref-00000001", role: "button", name: "OK", aria_required: null, aria_expanded: null, aria_checked: null, aria_invalid: null }]
    });
    expect(text).toContain("600 interactive nodes");
    expect(text).not.toContain("showing 1 of 1 elements");
  });

  it("leaves small snapshots unchanged", () => {
    const snap = {
      snapshot_id: 2,
      url: "https://app.com/small",
      title: "Small",
      elements: [
        {
          ref: "ref-a1b2c3d4",
          role: "button",
          name: "Go",
          aria_required: null,
          aria_expanded: null,
          aria_checked: null,
          aria_invalid: null
        }
      ]
    };
    expect(formatSnapshot(snap)).toBe(formatSnapshot(snap, BROWSER_READ_CHAR_BUDGET));
    expect(formatSnapshot(snap)).not.toContain("showing");
  });

  it("trims whole element lines and adds showing N of M notice on large snapshots", () => {
    const elements = Array.from({ length: 200 }, (_, i) => ({
      ref: `ref-${String(i).padStart(8, "0")}`,
      role: "button",
      name: `Action number ${i} with a deliberately long accessible name for budget testing`,
      testid: `btn-${i}`,
      aria_required: null,
      aria_expanded: null,
      aria_checked: null,
      aria_invalid: null
    }));

    const text = formatSnapshot({
      snapshot_id: 9,
      url: "https://app.com/big",
      title: "Big Page",
      elements
    });

    expect(text.length).toBeLessThanOrEqual(BROWSER_READ_CHAR_BUDGET);
    expect(text).toMatch(/⚠️ showing \d+ of 200 elements — try viewport_only:true first/);
    const elementLines = text.split("\n").filter((line) => line.startsWith("- "));
    expect(elementLines.length).toBeGreaterThan(0);
    expect(elementLines.length).toBeLessThan(200);
    for (const line of elementLines) {
      expect(line).toMatch(/^- button "/);
    }
  });
});

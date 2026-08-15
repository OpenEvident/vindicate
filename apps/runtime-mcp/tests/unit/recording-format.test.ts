import { describe, expect, it } from "vitest";

import type { RecordingArtifact } from "@vindicate/protocol";

import { formatChosenLocator, formatRecordingForAi } from "../../src/mcp/tools/recording-format.js";

const baseArtifact: RecordingArtifact = {
  name: "Login Flow",
  recorded_at: "2026-06-07T12:00:00.000Z",
  session_id: "00000000-0000-4000-8000-000000000001",
  project_root: "/proj",
  status: "finalized",
  steps: [
    {
      seq: 1,
      action: "click",
      timestamp: "2026-06-07T12:00:01.000Z",
      chosen: { strategy: "testid", value: "login-btn", attr: "data-testid" },
      candidates: [],
      element: { tag: "button", name: "Login" }
    },
    {
      seq: 2,
      action: "fill",
      timestamp: "2026-06-07T12:00:02.000Z",
      text: "bad@x.com",
      chosen: { strategy: "testid", value: "email", attr: "data-testid" },
      candidates: [],
      element: { tag: "input", name: "Email" }
    },
    {
      seq: 3,
      action: "snapshot",
      timestamp: "2026-06-07T12:00:03.000Z",
      candidates: [],
      chosen: null,
      page_snapshot: {
        url: "https://app/login",
        title: "Login",
        alerts: ["Invalid credentials"],
        elements: [
          {
            ref: "ref-email",
            role: "textbox",
            name: "Email",
            tag: "input",
            value: "bad@x.com",
            aria_invalid: true,
            candidates: [
              { strategy: "testid", value: "email", attr: "data-testid" },
              { strategy: "css", value: "#email" }
            ],
            chosen: { strategy: "testid", value: "email", attr: "data-testid" },
            element: { tag: "input", name: "Email" }
          },
          {
            ref: "ref-submit",
            role: "button",
            name: "Sign in",
            tag: "button",
            candidates: [],
            chosen: { strategy: "testid", value: "submit", attr: "data-testid" },
            element: { tag: "button", name: "Sign in" }
          }
        ]
      }
    },
    {
      seq: 4,
      action: "snapshot",
      timestamp: "2026-06-07T12:00:04.000Z",
      candidates: [],
      chosen: null,
      page_snapshot: {
        url: "https://app/login",
        title: "Login",
        elements: [
          {
            ref: "ref-email",
            role: "textbox",
            name: "Email",
            tag: "input",
            value: "good@x.com",
            aria_invalid: false,
            candidates: [],
            chosen: { strategy: "testid", value: "email", attr: "data-testid" },
            element: { tag: "input", name: "Email" }
          },
          {
            ref: "ref-submit",
            role: "button",
            name: "Sign in",
            tag: "button",
            candidates: [],
            chosen: { strategy: "testid", value: "submit", attr: "data-testid" },
            element: { tag: "button", name: "Sign in" }
          }
        ]
      }
    }
  ],
  final_snapshot: {
    url: "https://app/login",
    title: "Login",
    elements: [
      {
        ref: "ref-email",
        role: "textbox",
        name: "Email",
        tag: "input",
        value: "good@x.com",
        aria_invalid: false,
        candidates: [],
        chosen: { strategy: "testid", value: "email", attr: "data-testid" },
        element: { tag: "input", name: "Email" }
      },
      {
        ref: "ref-submit",
        role: "button",
        name: "Sign in",
        tag: "button",
        candidates: [],
        chosen: { strategy: "testid", value: "submit", attr: "data-testid" },
        element: { tag: "button", name: "Sign in" }
      }
    ]
  }
};

describe("formatChosenLocator", () => {
  it("formats testid as attr badge", () => {
    expect(formatChosenLocator({ strategy: "testid", value: "go", attr: "e2e" })).toBe("[e2e=go]");
  });

  it("renders every selector strategy", () => {
    const strategies = [
      { strategy: "testid" as const, value: "go", attr: "data-testid" },
      {
        strategy: "scoped" as const,
        value: 'button[name="Delete"]',
        container: { role: "row", name: "Product ABC" }
      },
      { strategy: "role+name" as const, value: 'button[name="Save"]' },
      { strategy: "css" as const, value: "#save" },
      { strategy: "xpath" as const, value: "//button" },
      {
        strategy: "sibling_text" as const,
        value: '//input[preceding-sibling::*[normalize-space()="Delete"]]'
      }
    ];
    for (const candidate of strategies) {
      expect(formatChosenLocator(candidate).length).toBeGreaterThan(0);
    }
  });

  it("formats sibling_text as its raw xpath value (like attr_combo/nth)", () => {
    const xpath = '//input[preceding-sibling::*[normalize-space()="Delete"]]';
    expect(formatChosenLocator({ strategy: "sibling_text", value: xpath })).toBe(xpath);
  });

  it("truncates a long sibling_text xpath the same way as other xpath-backed strategies", () => {
    const longXpath = `//input[preceding-sibling::*[normalize-space()="${"x".repeat(100)}"]]`;
    const formatted = formatChosenLocator({ strategy: "sibling_text", value: longXpath });
    expect(formatted.length).toBe(80);
    expect(formatted.endsWith("...")).toBe(true);
  });
});

describe("formatRecordingForAi navigate triggers", () => {
  it("renders implicit navigations as auto results", () => {
    const artifact: RecordingArtifact = {
      ...baseArtifact,
      steps: [
        {
          seq: 1,
          action: "click",
          timestamp: "2026-06-07T12:00:01.000Z",
          candidates: [],
          chosen: null,
          element: { tag: "button", name: "Login" }
        },
        {
          seq: 2,
          action: "navigate",
          timestamp: "2026-06-07T12:00:02.000Z",
          url: "https://app/dashboard",
          navigation_trigger: "implicit",
          candidates: [],
          chosen: null
        }
      ]
    };
    const text = formatRecordingForAi(artifact);
    expect(text).toContain("↪ navigated to https://app/dashboard");
    expect(text).toContain("not a separate step");
  });

  it("skips snapshot when describing implicit navigation cause", () => {
    const artifact: RecordingArtifact = {
      ...baseArtifact,
      steps: [
        {
          seq: 7,
          action: "click",
          timestamp: "2026-06-07T12:00:01.000Z",
          candidates: [],
          chosen: null,
          element: { tag: "button", name: "Login" }
        },
        {
          seq: 8,
          action: "snapshot",
          timestamp: "2026-06-07T12:00:02.000Z",
          candidates: [],
          chosen: null
        },
        {
          seq: 9,
          action: "navigate",
          timestamp: "2026-06-07T12:00:03.000Z",
          url: "https://app/dashboard",
          navigation_trigger: "implicit",
          candidates: [],
          chosen: null
        }
      ]
    };
    const text = formatRecordingForAi(artifact);
    expect(text).toContain("result of step 7");
  });
});

describe("formatRecordingForAi", () => {
  it("does not emit @refs", () => {
    const text = formatRecordingForAi(baseArtifact);
    expect(text).not.toContain("@ref-");
  });

  it("includes compact flow with chosen locators only", () => {
    const text = formatRecordingForAi(baseArtifact);
    expect(text).toContain('1  click     "Login" [data-testid=login-btn]');
    expect(text).toContain('2  fill      "Email" (bad@x.com) [data-testid=email]');
    expect(text).toContain("3  snapshot  → snap-1");
    expect(text).toContain("browser_read before browser_act");
  });

  it("flags a click-delegate chosen candidate in the flow line", () => {
    const delegateArtifact: RecordingArtifact = {
      ...baseArtifact,
      steps: [
        {
          seq: 1,
          action: "click",
          timestamp: "2026-06-07T12:00:01.000Z",
          chosen: { strategy: "text", value: "GAY EVENT", click_delegate: true },
          candidates: [],
          element: { tag: "span", name: "" }
        }
      ]
    };
    const text = formatRecordingForAi(delegateArtifact);
    expect(text).toContain("(click-delegate ancestor — click only, no check/uncheck)");
  });

  it("first snapshot is full and later snapshots are deltas", () => {
    const text = formatRecordingForAi(baseArtifact);
    expect(text).toContain("── snap-1 · step 3 · Login ──");
    expect(text).toContain('- textbox "Email" [data-testid=email] (bad@x.com) [invalid]');
    expect(text).toContain("── snap-2 · step 4 · Login (delta from snap-1) ──");
    expect(text).toContain('~ textbox "Email" [data-testid=email]  value: bad@x.com → good@x.com');
    expect(text).toContain("── snap-final · stop · Login (delta from snap-2) ──");
    expect(text).toContain("(no element changes)");
  });
});

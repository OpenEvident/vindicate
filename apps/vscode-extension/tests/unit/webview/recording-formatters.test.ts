import { describe, expect, it } from "vitest";

import {
  deriveTargetUrlFromSteps,
  formatNavigationStepSummary,
  formatSnapshotSummary,
  formatStepEnvVarLabel,
  getCandidateStrategyLabel,
  getNavigationTrigger,
  getStepPageSnapshot,
  getTargetLabel,
  isStepEnvVar,
  normalizeRecordingStep,
  renumberSteps,
  resolvePreviewUrl
} from "../../../src/webview/lib/recording-formatters";
import type { RecordingStep } from "../../../src/webview/lib/recording-ui-types";

describe("recording-formatters", () => {
  it("getCandidateStrategyLabel uses attr for testid strategy", () => {
    expect(
      getCandidateStrategyLabel({ strategy: "testid", value: "email", attr: "data-testid" })
    ).toBe("data-testid");
  });

  it("labels every selector strategy", () => {
    const labels = [
      getCandidateStrategyLabel({ strategy: "testid", value: "x", attr: "data-testid" }),
      getCandidateStrategyLabel({ strategy: "scoped", value: 'button[name="Delete"]' }),
      getCandidateStrategyLabel({ strategy: "role+name", value: 'button[name="Save"]' }),
      getCandidateStrategyLabel({ strategy: "css", value: "#save" }),
      getCandidateStrategyLabel({ strategy: "xpath", value: "//button" }),
      getCandidateStrategyLabel({ strategy: "sibling_text", value: "//input[…]" })
    ];
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it("getCandidateStrategyLabel renders sibling_text as a friendly label", () => {
    expect(getCandidateStrategyLabel({ strategy: "sibling_text", value: "//input[…]" })).toBe(
      "sibling text"
    );
  });

  it("getTargetLabel formats named element", () => {
    const step: RecordingStep = {
      seq: 1,
      action: "click",
      timestamp: new Date().toISOString(),
      element: { name: "Login", tag: "button" },
      candidates: [],
      chosen: null
    };
    expect(getTargetLabel(step)).toBe('"Login" button');
  });

  it("renumberSteps reassigns seq from 1", () => {
    const steps: RecordingStep[] = [
      { seq: 5, action: "click", timestamp: "", candidates: [], chosen: null },
      { seq: 9, action: "fill", timestamp: "", candidates: [], chosen: null }
    ];
    expect(renumberSteps(steps).map((s) => s.seq)).toEqual([1, 2]);
  });

  it("resolvePreviewUrl prefers selected step url", () => {
    const steps: RecordingStep[] = [
      {
        seq: 1,
        action: "navigate",
        timestamp: "",
        url: "https://a.example/login",
        candidates: [],
        chosen: null
      },
      {
        seq: 2,
        action: "click",
        timestamp: "",
        url: "https://a.example/dashboard",
        candidates: [],
        chosen: null
      }
    ];
    expect(
      resolvePreviewUrl({ type: "step", seq: 2 }, steps[1], steps, "https://fallback.example")
    ).toBe("https://a.example/dashboard");
  });

  it("resolvePreviewUrl falls back to session target before blank", () => {
    expect(resolvePreviewUrl({ type: "none" }, undefined, [], "app.example.com/home")).toBe(
      "app.example.com/home"
    );
    expect(resolvePreviewUrl({ type: "none" }, undefined, [], null)).toBe("about:blank");
  });

  it("deriveTargetUrlFromSteps uses latest step url", () => {
    const steps: RecordingStep[] = [
      {
        seq: 1,
        action: "navigate",
        timestamp: "",
        url: "https://old.example",
        candidates: [],
        chosen: null
      },
      {
        seq: 2,
        action: "click",
        timestamp: "",
        url: "https://new.example",
        candidates: [],
        chosen: null
      }
    ];
    expect(deriveTargetUrlFromSteps(steps)).toBe("https://new.example");
  });

  it("getStepPageSnapshot reads snake_case page_snapshot from worker payloads", () => {
    const step = {
      seq: 1,
      action: "snapshot" as const,
      timestamp: "",
      candidates: [],
      chosen: null,
      page_snapshot: {
        url: "https://app.example/login",
        title: "Login",
        elements: [
          {
            ref: "e1",
            role: "button",
            name: "Sign in",
            tag: "button",
            candidates: [],
            chosen: null
          }
        ],
        alerts: ["Invalid credentials"]
      }
    };
    expect(getStepPageSnapshot(step)?.title).toBe("Login");
    expect(formatSnapshotSummary(getStepPageSnapshot(step))).toBe("1 element · 1 alert");
    expect(getTargetLabel(step)).toBe("Login");
  });

  it("isStepEnvVar reads snake_case env_var from artifacts", () => {
    const step = {
      seq: 2,
      action: "fill" as const,
      timestamp: "",
      text: "secret",
      candidates: [],
      chosen: null,
      env_var: true,
      env_var_name: "PASSWORD"
    };
    expect(isStepEnvVar(step)).toBe(true);
    expect(formatStepEnvVarLabel(step)).toBe("Env var · PASSWORD");
  });

  it("getNavigationTrigger reads snake_case navigation_trigger from artifacts", () => {
    const step = {
      seq: 3,
      action: "navigate" as const,
      timestamp: "",
      url: "https://app.example/dashboard",
      candidates: [],
      chosen: null,
      navigation_trigger: "implicit" as const
    };
    expect(getNavigationTrigger(step)).toBe("implicit");
    expect(normalizeRecordingStep(step).navigationTrigger).toBe("implicit");
  });

  it("formatNavigationStepSummary describes implicit and explicit navigations", () => {
    expect(
      formatNavigationStepSummary({
        seq: 4,
        action: "navigate",
        timestamp: "",
        url: "https://app.example/dashboard",
        candidates: [],
        chosen: null,
        navigationTrigger: "implicit"
      })
    ).toContain("step 3");

    expect(
      formatNavigationStepSummary({
        seq: 1,
        action: "navigate",
        timestamp: "",
        url: "https://app.example/login",
        candidates: [],
        chosen: null,
        navigationTrigger: "explicit"
      })
    ).toContain("Manual");
  });

  it("getTargetLabel describes tab-switch actions", () => {
    expect(
      getTargetLabel({
        seq: 1,
        action: "switch_tab_by_url",
        timestamp: "",
        url: "https://checkout.klarna.com/session/abc",
        candidates: [],
        chosen: null
      })
    ).toBe("Switched to tab: https://checkout.klarna.com/session/abc");

    expect(
      getTargetLabel({
        seq: 2,
        action: "new_tab",
        timestamp: "",
        url: "https://example.com",
        candidates: [],
        chosen: null
      })
    ).toBe("Opened tab: https://example.com");

    expect(
      getTargetLabel({
        seq: 3,
        action: "switch_tab",
        timestamp: "",
        index: 0,
        candidates: [],
        chosen: null
      })
    ).toBe("Switched to tab: #0");

    expect(
      getTargetLabel({ seq: 4, action: "close_tab", timestamp: "", candidates: [], chosen: null })
    ).toBe("Closed tab");
  });

  it("formatNavigationStepSummary skips snapshot when finding implicit cause", () => {
    const steps: RecordingStep[] = [
      { seq: 7, action: "click", timestamp: "", candidates: [], chosen: null },
      { seq: 8, action: "snapshot", timestamp: "", candidates: [], chosen: null },
      {
        seq: 9,
        action: "navigate",
        timestamp: "",
        url: "https://app.example/dashboard",
        candidates: [],
        chosen: null,
        navigationTrigger: "implicit"
      }
    ];
    expect(formatNavigationStepSummary(steps[2]!, steps)).toContain("step 7");
  });
});

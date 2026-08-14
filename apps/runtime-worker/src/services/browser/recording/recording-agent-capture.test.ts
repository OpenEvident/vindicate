import { describe, expect, it } from "vitest";

import {
  classifyNavigation,
  isRealPageUrl,
  shouldSkipDuplicateNavigateStep,
  shouldSuppressAgentDomEvent
} from "./recording-agent-capture.js";

describe("shouldSuppressAgentDomEvent", () => {
  it("suppresses interaction events during agent recording", () => {
    expect(shouldSuppressAgentDomEvent("agent", "fill")).toBe(true);
    expect(shouldSuppressAgentDomEvent("agent", "click")).toBe(true);
  });

  it("allows navigate and snapshot during agent recording", () => {
    expect(shouldSuppressAgentDomEvent("agent", "navigate")).toBe(false);
    expect(shouldSuppressAgentDomEvent("agent", "snapshot")).toBe(false);
  });

  it("does not suppress events during human recording", () => {
    expect(shouldSuppressAgentDomEvent("human", "fill")).toBe(false);
    expect(shouldSuppressAgentDomEvent(undefined, "click")).toBe(false);
  });
});

describe("classifyNavigation", () => {
  const now = Date.parse("2026-06-14T12:00:05.000Z");

  it("returns implicit after a recent click", () => {
    expect(
      classifyNavigation(
        [{ action: "click", timestamp: "2026-06-14T12:00:03.500Z" }],
        now
      )
    ).toBe("implicit");
  });

  it("returns explicit when isolated from interactions", () => {
    expect(
      classifyNavigation(
        [{ action: "navigate", timestamp: "2026-06-14T12:00:00.000Z" }],
        now
      )
    ).toBe("explicit");
  });

  it("returns explicit when the last interaction is outside the window", () => {
    expect(
      classifyNavigation(
        [{ action: "click", timestamp: "2026-06-14T12:00:00.000Z" }],
        now
      )
    ).toBe("explicit");
  });
});

describe("isRealPageUrl", () => {
  it("rejects about:blank", () => {
    expect(isRealPageUrl("about:blank")).toBe(false);
  });

  it("accepts https URLs", () => {
    expect(isRealPageUrl("https://example.com")).toBe(true);
  });
});

describe("shouldSkipDuplicateNavigateStep", () => {
  it("skips navigate when the previous step is the same url", () => {
    expect(
      shouldSkipDuplicateNavigateStep(
        [{ action: "navigate", url: "https://example.com/home" }],
        "https://example.com/home"
      )
    ).toBe(true);
  });

  it("keeps navigate after a click-triggered navigation", () => {
    expect(
      shouldSkipDuplicateNavigateStep(
        [{ action: "click", url: "https://example.com/login" }],
        "https://example.com/home"
      )
    ).toBe(false);
  });
});

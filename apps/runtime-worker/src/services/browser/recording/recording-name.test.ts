import { describe, expect, it } from "vitest";

import { sanitizeRecordingName } from "./recording-name.js";

describe("sanitizeRecordingName", () => {
  it("replaces spaces with dashes", () => {
    expect(sanitizeRecordingName("Login Flow")).toBe("Login-Flow");
  });

  it("strips invalid Windows filename characters", () => {
    expect(sanitizeRecordingName('Checkout: Happy / Path')).toBe("Checkout-Happy-Path");
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeRecordingName("a   b")).toBe("a-b");
  });

  it("falls back when everything is stripped", () => {
    expect(sanitizeRecordingName("???")).toBe("recording");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    expect(sanitizeRecordingName(long).length).toBe(80);
  });
});

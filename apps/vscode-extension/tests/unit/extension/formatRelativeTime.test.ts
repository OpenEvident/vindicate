import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "../../../src/extension/shared/formatRelativeTime";

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-12T12:00:00.000Z").getTime();

  it("returns Just now for recent timestamps", () => {
    expect(formatRelativeTime("2026-06-12T11:59:30.000Z", now)).toBe("Just now");
  });

  it("returns minutes ago", () => {
    expect(formatRelativeTime("2026-06-12T11:30:00.000Z", now)).toBe("30 min ago");
  });

  it("returns hours ago", () => {
    expect(formatRelativeTime("2026-06-12T09:00:00.000Z", now)).toBe("3h ago");
  });

  it("returns Yesterday label for previous day", () => {
    const label = formatRelativeTime("2026-06-11T11:00:00.000Z", now);
    expect(label.startsWith("Yesterday ·")).toBe(true);
  });
});

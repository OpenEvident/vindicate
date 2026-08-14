import { beforeEach, describe, expect, it } from "vitest";
import {
  isDashboardMcpBannerHidden,
  mcpBannerStorageKey,
  setDashboardMcpBannerHidden
} from "../../../src/webview/lib/mcpBannerPrefs";

describe("mcpBannerPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false when not set for a folder", () => {
    expect(isDashboardMcpBannerHidden("E:/projects/alpha")).toBe(false);
  });

  it("persists hidden preference per folder", () => {
    setDashboardMcpBannerHidden("E:/projects/alpha", true);
    setDashboardMcpBannerHidden("E:/projects/beta", false);

    expect(isDashboardMcpBannerHidden("E:/projects/alpha")).toBe(true);
    expect(isDashboardMcpBannerHidden("E:/projects/beta")).toBe(false);
  });

  it("normalizes path separators in storage keys", () => {
    const forward = mcpBannerStorageKey("E:/projects/alpha");
    const back = mcpBannerStorageKey("E:\\projects\\alpha");
    expect(forward).toBe(back);
  });

  it("clears hidden when set to false", () => {
    setDashboardMcpBannerHidden("E:/projects/alpha", true);
    setDashboardMcpBannerHidden("E:/projects/alpha", false);
    expect(isDashboardMcpBannerHidden("E:/projects/alpha")).toBe(false);
  });

  it("removes legacy global hide key without applying it", () => {
    localStorage.setItem("vindicate.dashboard.mcpBannerHidden", "1");
    expect(isDashboardMcpBannerHidden("E:/projects/alpha")).toBe(false);
    expect(localStorage.getItem("vindicate.dashboard.mcpBannerHidden")).toBeNull();
  });
});

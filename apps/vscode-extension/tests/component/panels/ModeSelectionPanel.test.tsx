import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModeSelectionPanel } from "../../../src/webview/components/panels/ModeSelectionPanel";

describe("ModeSelectionPanel", () => {
  it("titles the featured card by mode name, matching the 'coming soon' cards below it", () => {
    render(<ModeSelectionPanel />);
    // Regression guard: the featured card previously derived its title from the first sentence of the
    // headline ("Codebase exists"), while the soon cards below use the mode id ("Fix"/"Structure"/
    // "Bridge") — an inconsistent title style for the same card grid.
    expect(screen.getByText("Build")).toBeTruthy();
    expect(screen.queryByText("Codebase exists")).toBeNull();
    expect(screen.getByText("Codebase exists. No tests yet.")).toBeTruthy();
    expect(screen.getByText("Fix")).toBeTruthy();
    expect(screen.getByText("Structure")).toBeTruthy();
    expect(screen.getByText("Bridge")).toBeTruthy();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolSelectionPanel } from "../../../src/webview/components/panels/ToolSelectionPanel";
import { useOnboardingStore } from "../../../src/webview/stores/onboardingStore";
import * as bridge from "../../../src/webview/lib/bridge";

describe("ToolSelectionPanel", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      screen: "toolSelection",
      confirmedTools: null,
      detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: false }
    });
  });

  it("renders a card for all four tools, including Antigravity", () => {
    render(<ToolSelectionPanel />);
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("GitHub Copilot")).toBeInTheDocument();
    expect(screen.getByText("Antigravity")).toBeInTheDocument();
  });

  it("shows Antigravity as DETECTED when the store says so, and lists its files", () => {
    useOnboardingStore.setState({
      screen: "toolSelection",
      confirmedTools: null,
      detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: true }
    });
    render(<ToolSelectionPanel />);
    // Antigravity card is checked by default since it was detected — its files should be listed.
    expect(screen.getByText(".agents/mcp_config.json")).toBeInTheDocument();
    expect(screen.getByText(".agents/AGENTS.md")).toBeInTheDocument();
    expect(screen.getByText(".agents/skills/vindicate/SKILL.md")).toBeInTheDocument();
  });

  it("lets the user check Antigravity even when not auto-detected, and includes it in the confirm payload", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<ToolSelectionPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Use Antigravity on this project" }));
    fireEvent.click(screen.getByRole("button", { name: /Configure/ }));

    expect(post).toHaveBeenCalledWith({
      type: "onboarding:confirmTools",
      tools: { cursor: false, vscode: false, claudeCode: false, antigravity: true }
    });
    post.mockRestore();
  });

  it("does not include Antigravity in the file count when unchecked", () => {
    render(<ToolSelectionPanel />);
    // Nothing detected/checked by default in this test's setup — the button should reflect that
    // no agent (and so no files) are currently selected.
    expect(screen.getByText("Choose at least one agent to continue")).toBeInTheDocument();
  });
});

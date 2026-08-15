import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarView } from "../../../src/webview/components/sidebar/SidebarView";
import { useOnboardingStore } from "../../../src/webview/stores/onboardingStore";
import { useHealthStore } from "../../../src/webview/stores/healthStore";
import * as bridge from "../../../src/webview/lib/bridge";

describe("SidebarView", () => {
  it("renders no-folder card with open folder action", () => {
    useOnboardingStore.setState({
      hasFolder: false,
      folderName: null,
      mode: null,
      completedSteps: [],
      screen: "noFolder",
      onboardingDone: false,
      detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: false }
    });
    useHealthStore.setState({ runtime: "unknown", mcp: "unknown" });
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});

    render(<SidebarView />);

    expect(screen.getByText("Open a workspace to begin")).toBeInTheDocument();
    const openFolder = screen.getByRole("button", { name: "Open folder" });
    fireEvent.click(openFolder);
    expect(post).toHaveBeenCalledWith({ type: "nav:openFolder" });
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();

    post.mockRestore();
  });

  it("overflow menu exposes Open home page and Prompts & Config", () => {
    useOnboardingStore.setState({
      hasFolder: true,
      folderName: "p",
      mode: null,
      completedSteps: [],
      screen: "toolSelection",
      onboardingDone: false,
      detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: false }
    });
    useHealthStore.setState({ runtime: "up", mcp: "unknown" });

    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<SidebarView />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Open home page" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Recordings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Prompts & Config" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Open home page" }));
    expect(post).toHaveBeenCalledWith({ type: "nav:openFullView" });

    post.mockRestore();
  });

  it("shows status footer with Runtime, MCP and version", () => {
    useOnboardingStore.setState({
      hasFolder: true,
      folderName: "p",
      mode: null,
      completedSteps: [],
      screen: "toolSelection",
      onboardingDone: false,
      detectedTools: { cursor: false, vscode: false, claudeCode: false, antigravity: false }
    });
    useHealthStore.setState({ runtime: "up", mcp: "down" });

    render(<SidebarView />);
    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });
});

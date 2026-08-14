import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigTab } from "../../../src/webview/components/panel/ConfigTab";
import { useConfigStore } from "../../../src/webview/stores/configStore";
import * as bridge from "../../../src/webview/lib/bridge";

describe("ConfigTab", () => {
  beforeEach(() => {
    useConfigStore.setState({
      statuses: {
        cursor: false,
        vscode: false,
        claudeCode: false,
        antigravity: false,
        cursorRule: false,
        agentMd: false,
        copilotInstructions: false,
        antigravityRule: false,
        agentSkill: false
      },
      pending: {}
    });
  });

  it("shows Add when not configured", () => {
    useConfigStore.getState().setStatuses({
      cursor: false,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    });
    render(<ConfigTab />);
    expect(screen.getAllByRole("button", { name: "Add" }).length).toBeGreaterThan(0);
  });

  it("shows connected status when configured", () => {
    useConfigStore.getState().setStatuses({
      cursor: true,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    });
    render(<ConfigTab />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("posts addMcp when Add clicked", () => {
    useConfigStore.getState().setStatuses({
      cursor: false,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    });
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<ConfigTab />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]!);
    expect(post).toHaveBeenCalled();
    post.mockRestore();
  });

  it("posts resync for connected agent", () => {
    useConfigStore.getState().setStatuses({
      cursor: true,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    });
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<ConfigTab />);

    fireEvent.click(screen.getByRole("button", { name: "Re-sync" }));

    expect(post).toHaveBeenCalledWith({ type: "config:resyncMcp", tool: "cursor" });
    post.mockRestore();
  });

  it("posts disconnect for connected agent", () => {
    useConfigStore.getState().setStatuses({
      cursor: true,
      vscode: false,
      claudeCode: false,
      antigravity: false,
      cursorRule: false,
      agentMd: false,
      copilotInstructions: false,
      antigravityRule: false,
      agentSkill: false
    });
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<ConfigTab />);

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(post).toHaveBeenCalledWith({ type: "config:disconnectMcp", tool: "cursor" });
    post.mockRestore();
  });
});

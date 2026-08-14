import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { McpEnableCallout } from "../../../src/webview/components/shared/McpEnableCallout";

describe("McpEnableCallout", () => {
  it("renders scaffold variant without dismiss", () => {
    render(<McpEnableCallout title="Before you run the prompt" variant="scaffold" />);
    expect(screen.getByText("Before you run the prompt")).toBeTruthy();
    expect(screen.getByText(/won't have access to Vindicate tools/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hide MCP reminder" })).toBeNull();
  });

  it("renders attention badge and class when attention is on", () => {
    const { container } = render(
      <McpEnableCallout title="Enable Vindicate MCP" attention dismissible onDismiss={vi.fn()} />
    );
    expect(screen.getByText("Action required")).toBeTruthy();
    expect(container.querySelector(".vindicate-mcp-callout--attention")).toBeTruthy();
  });

  it("calls onDismiss when Hide is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <McpEnableCallout
        title="Enable Vindicate MCP in your agent"
        dismissible
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide MCP reminder" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

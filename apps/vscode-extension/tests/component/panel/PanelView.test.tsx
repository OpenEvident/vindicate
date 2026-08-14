import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelView } from "../../../src/webview/components/panel/PanelView";

describe("PanelView", () => {
  it("renders utility tabs and defaults to Prompts", () => {
    render(<PanelView />);
    expect(screen.getByRole("tab", { name: /Prompts/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByPlaceholderText("Search templates, variables, content...")).toBeInTheDocument();
  });

  it("switches to Config tab", () => {
    render(<PanelView />);
    fireEvent.click(screen.getByRole("tab", { name: "Config" }));
    expect(screen.getByRole("tab", { name: "Config" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("MCP and agent setup")).toBeInTheDocument();
  });

  it("does not render Logs tab", () => {
    render(<PanelView />);
    expect(screen.queryByRole("tab", { name: "Logs" })).not.toBeInTheDocument();
  });
});

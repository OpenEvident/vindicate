import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActionBadge } from "@/components/recording/shared/ActionBadge";

describe("ActionBadge", () => {
  it("renders click action label", () => {
    render(<ActionBadge action="click" />);
    expect(screen.getByText("Click")).toBeInTheDocument();
  });

  it("renders fill action label", () => {
    render(<ActionBadge action="fill" />);
    expect(screen.getByText("Fill")).toBeInTheDocument();
  });

  it("renders drag action label", () => {
    render(<ActionBadge action="drag" />);
    expect(screen.getByText("Drag")).toBeInTheDocument();
  });

  it("renders dblclick action label", () => {
    render(<ActionBadge action="dblclick" />);
    expect(screen.getByText("Dblclick")).toBeInTheDocument();
  });

  it("renders navigation trigger badges", () => {
    const { rerender } = render(<ActionBadge action="navigate" navigationTrigger="implicit" />);
    expect(screen.getByText("auto")).toBeInTheDocument();

    rerender(<ActionBadge action="navigate" navigationTrigger="explicit" />);
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders labels for the tab/popup awareness actions", () => {
    const { rerender } = render(<ActionBadge action="new_tab" />);
    expect(screen.getByText("New tab")).toBeInTheDocument();

    rerender(<ActionBadge action="switch_tab" />);
    expect(screen.getByText("Switch tab")).toBeInTheDocument();

    rerender(<ActionBadge action="switch_tab_by_url" />);
    expect(screen.getByText("Switch tab")).toBeInTheDocument();

    rerender(<ActionBadge action="close_tab" />);
    expect(screen.getByText("Close tab")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KPICard } from "../../../src/webview/components/dashboard/KPICard";

describe("KPICard", () => {
  it("renders value and subtext", () => {
    render(<KPICard label="Spec Completeness" value={65} unit="%" sub="3 of 5 specs complete" />);
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 specs complete")).toBeInTheDocument();
  });

  it("shows weighting when provided", () => {
    render(<KPICard label="Fresh" value={60} unit="%" sub="freshness" weight={10} />);
    expect(screen.getByText("x10%")).toBeInTheDocument();
  });
});

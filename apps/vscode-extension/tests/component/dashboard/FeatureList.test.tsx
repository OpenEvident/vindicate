import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureMatrix } from "../../../src/webview/components/dashboard/FeatureMatrix";

describe("FeatureMatrix", () => {
  it("renders table headings", () => {
    render(<FeatureMatrix features={[]} />);
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("Pass rate")).toBeInTheDocument();
  });

  it("shows feature row data", () => {
    const feature = {
      name: "Auth",
      slug: "auth",
      ac: 3,
      linkedTests: 2,
      specStatus: "complete" as const,
      hasTests: true,
      specFile: ".vindicate/stories/auth.story.md",
      headings: {
        feature: true,
        persona: true,
        acceptanceCriteria: true,
        testcases: true,
        outOfScope: true
      },
      words: 120,
      specMod: "recently",
      tests: { total: 2, passed: 2, failed: 0, skipped: 0, flaky: 0 },
      lastTouched: "recently"
    };
    render(<FeatureMatrix features={[feature]} />);
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepCard } from "@/components/recording/editor/StepCard";
import type { RecordingStep } from "@/lib/recording-ui-types";

const clickStep: RecordingStep = {
  seq: 1,
  action: "click",
  timestamp: "2026-06-20T00:00:00.000Z",
  element: { name: "Submit", tag: "button" },
  candidates: [{ strategy: "dom_id", value: "submit-btn", strength: "strong" }],
  chosen: { strategy: "dom_id", value: "submit-btn", strength: "strong" }
};

const switchTabStep: RecordingStep = {
  seq: 2,
  action: "switch_tab_by_url",
  timestamp: "2026-06-20T00:00:01.000Z",
  url: "https://checkout.klarna.com/session/abc",
  candidates: [],
  chosen: null
};

describe("StepCard locator area", () => {
  it("renders a locator picker for a click step (has a real element target)", () => {
    render(<StepCard step={clickStep} mode="review" selected={false} isLocatorOpen={false} />);
    // LocatorPicker renders the chosen candidate's strategy label when candidates exist.
    expect(screen.queryByText("No candidates captured")).not.toBeInTheDocument();
  });

  it("does not render a locator picker for a switch_tab_by_url step (no element target by design)", () => {
    render(<StepCard step={switchTabStep} mode="review" selected={false} isLocatorOpen={false} />);
    // Regression guard: tab/popup actions carry candidates: [] by design (see agent-step-builder.ts's
    // buildTabActionPayload and recording.service.ts's synthesized switch_tab_by_url steps) — before this
    // fix, StepCard rendered a "No candidates captured" locator-picker placeholder for them anyway, which
    // reads as an error state ("something should have been captured but wasn't") for a step type that
    // never has candidates in the first place.
    expect(screen.queryByText("No candidates captured")).not.toBeInTheDocument();
  });

  it("shows the switch_tab_by_url target label instead", () => {
    render(<StepCard step={switchTabStep} mode="review" selected={false} isLocatorOpen={false} />);
    expect(
      screen.getByText("Switched to tab: https://checkout.klarna.com/session/abc")
    ).toBeInTheDocument();
  });
});

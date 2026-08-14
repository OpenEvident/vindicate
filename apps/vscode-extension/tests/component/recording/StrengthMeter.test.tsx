import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StrengthMeter } from "@/components/recording/shared/StrengthMeter";

describe("StrengthMeter", () => {
  it("defaults to medium strength when strength is undefined", () => {
    render(<StrengthMeter />);
    expect(screen.getByLabelText("Selector strength: Okay")).toBeInTheDocument();
  });

  it("shows strong label when strength is strong", () => {
    render(<StrengthMeter strength="strong" />);
    expect(screen.getByLabelText("Selector strength: Stable")).toBeInTheDocument();
  });
});

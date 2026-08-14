import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocatorPicker } from "@/components/recording/shared/LocatorPicker";
import type { LocatorCandidate } from "@/lib/recording-ui-types";

const candidates: LocatorCandidate[] = [
  { strategy: "testid", value: "email", attr: "data-testid", recommended: true, strength: "strong" },
  { strategy: "role+name", value: 'input[name="E-mail address"]', strength: "medium" },
];

describe("LocatorPicker", () => {
  it("opens and selects a different candidate", () => {
    const onChange = vi.fn();
    render(
      <LocatorPicker
        candidates={candidates}
        chosen={candidates[1]!}
        disabled={false}
        isOpen={true}
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("option", { name: /data-testid/i }).querySelector("button")!);
    expect(onChange).toHaveBeenCalledWith(candidates[0]);
  });

  it("does not open dropdown when disabled", () => {
    render(
      <LocatorPicker
        candidates={candidates}
        chosen={candidates[0]!}
        disabled={true}
        isOpen={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows empty state when no candidates", () => {
    render(
      <LocatorPicker
        candidates={[]}
        chosen={null}
        disabled={false}
        isOpen={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("No candidates captured")).toBeInTheDocument();
  });
});

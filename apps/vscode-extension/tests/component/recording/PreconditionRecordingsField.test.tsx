import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreconditionRecordingsField } from "@/components/recording/new-recording/PreconditionRecordingsField";
import type { RecordingSession } from "@/lib/recording-ui-types";

const finalized: RecordingSession[] = [
  {
    id: "login",
    name: "Login Flow",
    safeName: "Login-Flow",
    status: "finalized",
    stepCount: 4,
    startedAt: new Date().toISOString(),
    whenLabel: "1h ago",
    targetUrl: "app.example.com/login",
    started_by: "human",
    thumbnailUrl: "https://example.com/login.png"
  },
  {
    id: "checkout",
    name: "Checkout Flow",
    safeName: "Checkout-Flow",
    status: "finalized",
    stepCount: 6,
    startedAt: new Date().toISOString(),
    whenLabel: "2h ago",
    targetUrl: "app.example.com/checkout",
    started_by: "human"
  }
];

describe("PreconditionRecordingsField", () => {
  it("opens modal and adds selected recordings", () => {
    const onChange = vi.fn();
    render(<PreconditionRecordingsField sessions={finalized} value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add recording/i }));
    fireEvent.click(screen.getByRole("option", { name: /login flow/i }));
    fireEvent.click(screen.getByRole("button", { name: /add \(1\)/i }));

    expect(onChange).toHaveBeenCalledWith(["Login Flow"]);
  });

  it("removes a queued recording", () => {
    const onChange = vi.fn();
    render(
      <PreconditionRecordingsField
        sessions={finalized}
        value={["Login Flow"]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /remove login flow/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("moves a queued recording down", () => {
    const onChange = vi.fn();
    render(
      <PreconditionRecordingsField
        sessions={finalized}
        value={["Login Flow", "Checkout Flow"]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /move login flow down/i }));
    expect(onChange).toHaveBeenCalledWith(["Checkout Flow", "Login Flow"]);
  });
});

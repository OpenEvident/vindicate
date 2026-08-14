import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "../../../src/webview/components/shared/CopyButton";

describe("CopyButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Copy prompt initially", () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeTruthy();
  });

  it("shows Copied after click and resets", async () => {
    render(<CopyButton text="hello" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeTruthy();
  });
});

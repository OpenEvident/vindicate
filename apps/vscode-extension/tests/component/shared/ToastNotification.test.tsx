import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastNotification } from "../../../src/webview/components/shared/ToastNotification";

describe("ToastNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders message with status role", () => {
    const { getByRole } = render(
      <ToastNotification message="Step completed" onDismiss={() => {}} />
    );
    expect(getByRole("status").textContent).toBe("Step completed");
  });

  it("auto-dismisses after default duration", () => {
    const onDismiss = vi.fn();
    render(<ToastNotification message="Done" onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

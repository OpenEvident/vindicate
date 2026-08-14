import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonBlock } from "../../../src/webview/components/shared/SkeletonBlock";

describe("SkeletonBlock", () => {
  it("has aria-busy attribute", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-busy")).toBe("true");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunTestsControl } from "../../../src/webview/components/shared/RunTestsControl";
import * as bridge from "../../../src/webview/lib/bridge";

const suites = [
  { relativePath: "tests/smoke.spec.ts", label: "smoke" },
  { relativePath: "tests/login.spec.ts", label: "login" }
];

describe("RunTestsControl", () => {
  it("posts run-all without suites by default", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Run all tests" }));
    expect(post).toHaveBeenCalledWith({ type: "tests:runAll" });
    post.mockRestore();
  });

  it("posts selected suite paths only after unchecking a suite", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test suites" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /login/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run 1 suite" }));
    expect(post).toHaveBeenCalledWith({
      type: "tests:runAll",
      suites: ["tests/smoke.spec.ts"]
    });
    post.mockRestore();
  });

  it("Select all restores the run-all payload", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test suites" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /login/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Run all tests" }));
    expect(post).toHaveBeenCalledWith({ type: "tests:runAll" });
    post.mockRestore();
  });

  it("Select all deselects every suite when it is already checked", () => {
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test suites" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(screen.getByRole("checkbox", { name: /smoke/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /login/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Select a suite" })).toBeDisabled();
  });

  it("re-checking Select all after a deselect all restores run-all", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test suites" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(screen.getByRole("checkbox", { name: /smoke/i })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Run all tests" }));
    expect(post).toHaveBeenCalledWith({ type: "tests:runAll" });
    post.mockRestore();
  });

  it("allows picking suites again after deselecting all", () => {
    const post = vi.spyOn(bridge, "postToExtension").mockImplementation(() => {});
    render(<RunTestsControl suites={suites} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose test suites" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /login/i }));

    fireEvent.click(screen.getByRole("button", { name: "Run 1 suite" }));
    expect(post).toHaveBeenCalledWith({
      type: "tests:runAll",
      suites: ["tests/login.spec.ts"]
    });
    post.mockRestore();
  });

  it("hides the suite chevron when there are no suites", () => {
    render(<RunTestsControl suites={[]} />);
    expect(screen.getByRole("button", { name: "Run all tests" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose test suites" })).not.toBeInTheDocument();
  });
});

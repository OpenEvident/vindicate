import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PromptsTab } from "../../../src/webview/components/panel/PromptsTab";
import { BUILT_IN_PROMPTS } from "../../../src/webview/lib/prompts";
import { usePromptsStore } from "../../../src/webview/stores/promptsStore";

beforeEach(() => {
  usePromptsStore.setState({ templates: [] });
});

describe("PromptsTab", () => {
  it("renders built-in prompts", () => {
    render(<PromptsTab />);
    const prompts = BUILT_IN_PROMPTS;
    for (const p of prompts) {
      expect(screen.getByText(p.title)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: "Copy prompt" }).length).toBeGreaterThan(0);
  });

  it("filters by My templates category", () => {
    usePromptsStore.setState({
      templates: [
        {
          id: "my-template",
          name: "My Template",
          description: "Custom prompt",
          category: "domain",
          text: "Hello",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });
    render(<PromptsTab />);
    fireEvent.click(screen.getByRole("button", { name: /My templates/i }));
    expect(screen.getByText("My Template")).toBeInTheDocument();
    expect(screen.queryByText("Project Context")).not.toBeInTheDocument();
  });
});

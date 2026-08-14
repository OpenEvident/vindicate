import type { ToolBrandId } from "./brandAssets";
import type { SelectedTools } from "./types";

export interface ToolOption {
  key: keyof SelectedTools;
  label: string;
  brand: ToolBrandId;
  hint: string;
}

/** Tool list aligned with vindicate-vscode-mockup.html screen 3. */
export const TOOL_OPTIONS: ToolOption[] = [
  {
    key: "cursor",
    label: "Cursor",
    brand: "cursor",
    hint: "Writes MCP config + workspace rules"
  },
  {
    key: "claudeCode",
    label: "Claude Code",
    brand: "claude",
    hint: "Writes CLAUDE.md in your project"
  },
  {
    key: "vscode",
    label: "GitHub Copilot",
    brand: "copilot",
    hint: "Writes MCP config for VS Code / Copilot"
  },
  {
    key: "antigravity",
    label: "Antigravity",
    brand: "antigravity",
    hint: "Writes MCP config + AGENTS.md in your project"
  }
];

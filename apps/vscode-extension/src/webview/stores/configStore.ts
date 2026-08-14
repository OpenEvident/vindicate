import { create } from "zustand";
import type { ConfigStatuses, McpToolName } from "../lib/types";

interface ConfigStore {
  statuses: ConfigStatuses;
  pending: Partial<Record<McpToolName | "cursorRule" | "agentMd" | "copilotInstructions" | "antigravityRule", boolean>>;
  setStatus: (tool: McpToolName | "cursorRule" | "agentMd" | "copilotInstructions" | "antigravityRule", configured: boolean) => void;
  setStatuses: (statuses: ConfigStatuses) => void;
  setPending: (tool: McpToolName | "cursorRule" | "agentMd" | "copilotInstructions" | "antigravityRule", value: boolean) => void;
}

const defaultStatuses: ConfigStatuses = {
  cursor: false,
  vscode: false,
  claudeCode: false,
  antigravity: false,
  cursorRule: false,
  agentMd: false,
  copilotInstructions: false,
  antigravityRule: false,
  agentSkill: false
};

export const useConfigStore = create<ConfigStore>((set) => ({
  statuses: defaultStatuses,
  pending: {},
  setStatus: (tool, configured) =>
    set((state) => ({ statuses: { ...state.statuses, [tool]: configured } })),
  setStatuses: (statuses) => set({ statuses }),
  setPending: (tool, value) => set((state) => ({ pending: { ...state.pending, [tool]: value } }))
}));

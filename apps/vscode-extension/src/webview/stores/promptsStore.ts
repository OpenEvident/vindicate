import { create } from "zustand";
import type { PromptTemplate } from "../../shared/types";

interface PromptsStore {
  templates: PromptTemplate[];
  setTemplates: (templates: PromptTemplate[]) => void;
}

export const usePromptsStore = create<PromptsStore>((set) => ({
  templates: [],
  setTemplates: (templates) => set({ templates })
}));

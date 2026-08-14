import { create } from "zustand";
import type { StepId } from "../lib/types";

interface UiStore {
  toastMessage: string | null;
  showCompletionOverlay: boolean;
  lastAnimatedStep: StepId | null;
  setToast: (message: string | null) => void;
  setShowCompletionOverlay: (show: boolean) => void;
  setLastAnimatedStep: (step: StepId | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  toastMessage: null,
  showCompletionOverlay: false,
  lastAnimatedStep: null,
  setToast: (toastMessage) => set({ toastMessage }),
  setShowCompletionOverlay: (showCompletionOverlay) => set({ showCompletionOverlay }),
  setLastAnimatedStep: (lastAnimatedStep) => set({ lastAnimatedStep })
}));

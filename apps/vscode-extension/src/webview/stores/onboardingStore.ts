import { create } from "zustand";
import {
  EMPTY_SELECTED_TOOLS,
  type Mode,
  type VindicateWorkspaceState,
  type Screen,
  type SelectedTools,
  type StepId
} from "../lib/types";

interface OnboardingStore {
  screen: Screen;
  mode: Mode | null;
  completedSteps: StepId[];
  hasFolder: boolean;
  folderName: string | null;
  folderPath: string | null;
  onboardingDone: boolean;
  detectedTools: SelectedTools;
  confirmedTools: SelectedTools | null;
  activePanelOverride: Screen | null;
  recentFolders: string[];
  setScreen: (s: Screen) => void;
  setMode: (m: Mode) => void;
  markStepDone: (s: StepId) => void;
  revokeStep: (s: StepId) => void;
  syncState: (state: VindicateWorkspaceState) => void;
  setFolder: (hasFolder: boolean, name: string | null, path: string | null) => void;
  setDetectedTools: (tools: SelectedTools) => void;
  setConfirmedTools: (tools: SelectedTools) => void;
  setActivePanelOverride: (screen: Screen | null) => void;
  setRecentFolders: (folders: string[]) => void;
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  screen: "noFolder",
  mode: null,
  completedSteps: [],
  hasFolder: false,
  folderName: null,
  folderPath: null,
  onboardingDone: false,
  detectedTools: EMPTY_SELECTED_TOOLS,
  confirmedTools: null,
  activePanelOverride: null,
  recentFolders: [],
  setScreen: (screen) => set({ screen, activePanelOverride: null }),
  setMode: (mode) => set({ mode }),
  markStepDone: (step) =>
    set((state) => ({
      completedSteps: state.completedSteps.includes(step)
        ? state.completedSteps
        : [...state.completedSteps, step]
    })),
  revokeStep: (step) =>
    set((state) => {
      const completedSteps = state.completedSteps.filter((s) => s !== step);
      return {
        completedSteps,
        onboardingDone: state.onboardingDone && completedSteps.length >= 4
      };
    }),
  syncState: (state) =>
    set({
      mode: state.selectedMode,
      completedSteps: state.completedSteps,
      onboardingDone: state.onboardingDone
    }),
  setFolder: (hasFolder, folderName, folderPath) => set({ hasFolder, folderName, folderPath }),
  setDetectedTools: (detectedTools) => set({ detectedTools }),
  setConfirmedTools: (confirmedTools) => set({ confirmedTools }),
  setActivePanelOverride: (activePanelOverride) => set({ activePanelOverride }),
  setRecentFolders: (recentFolders) => set({ recentFolders })
}));

import { create } from "zustand";

interface HealthState {
  runtime: "up" | "down" | "unknown";
  mcp: "up" | "down" | "unknown";
  setStatus: (runtime: "up" | "down" | "unknown", mcp: "up" | "down" | "unknown") => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  runtime: "unknown",
  mcp: "unknown",
  setStatus: (runtime, mcp) => set({ runtime, mcp })
}));

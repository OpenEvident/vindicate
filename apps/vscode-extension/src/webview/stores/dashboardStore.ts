import { create } from "zustand";
import type { DashboardMetrics } from "../lib/types";

interface DashboardStore {
  metrics: DashboardMetrics | null;
  isLoading: boolean;
  error: string | null;
  setMetrics: (m: DashboardMetrics) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  metrics: null,
  isLoading: false,
  error: null,
  setMetrics: (metrics) => set({ metrics, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false })
}));

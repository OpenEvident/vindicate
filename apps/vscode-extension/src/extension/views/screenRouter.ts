import type { Screen } from "../shared/messages";

export interface ScreenRouterInput {
  folderPath: string | null;
  toolsConfirmed: boolean;
  selectedMode: string | null;
  onboardingDone: boolean;
}

export function deriveScreen(opts: ScreenRouterInput): Screen {
  if (!opts.folderPath) return "noFolder";
  if (!opts.toolsConfirmed) return "toolSelection";
  if (!opts.selectedMode) return "modeSelection";
  if (!opts.onboardingDone) return "scaffold";
  return "dashboard";
}

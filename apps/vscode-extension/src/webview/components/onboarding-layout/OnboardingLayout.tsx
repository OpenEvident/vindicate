import { useOnboardingStore } from "../../stores/onboardingStore";
import { FolderPanel } from "../panels/FolderPanel";
import { ToolSelectionPanel } from "../panels/ToolSelectionPanel";
import { ModeSelectionPanel } from "../panels/ModeSelectionPanel";
import { ScaffoldPanel } from "../panels/ScaffoldPanel";
import { OnboardingHeader } from "./OnboardingHeader";
import { OnboardingChecklist } from "./OnboardingChecklist";
import type { Screen } from "../../../shared/messages";

type ActivePanel = "toolSelection" | "modeSelection" | "scaffold" | "folder";

function deriveActivePanel(opts: { effectiveScreen: Screen }): ActivePanel {
  switch (opts.effectiveScreen) {
    case "toolSelection":
      return "toolSelection";
    case "modeSelection":
      return "modeSelection";
    case "scaffold":
    case "gettingStarted":
      return "scaffold";
    default:
      return "folder";
  }
}

function RightPanel({ panel }: { panel: ActivePanel }) {
  switch (panel) {
    case "toolSelection":
      return <ToolSelectionPanel />;
    case "modeSelection":
      return <ModeSelectionPanel />;
    case "scaffold":
      return <ScaffoldPanel />;
    default:
      return <FolderPanel />;
  }
}

export function OnboardingLayout() {
  const screen = useOnboardingStore((s) => s.screen);
  const activePanelOverride = useOnboardingStore((s) => s.activePanelOverride);

  const effectiveScreen: Screen = activePanelOverride ?? screen;

  const activePanel = deriveActivePanel({ effectiveScreen });

  return (
    <div className="vindicate-ob-root">
      <OnboardingHeader />
      <div className="vindicate-ob-body">
        <OnboardingChecklist />
        <div className="vindicate-ob-divider" aria-hidden />
        <main className="vindicate-ob-main">
          <RightPanel panel={activePanel} />
        </main>
      </div>
    </div>
  );
}

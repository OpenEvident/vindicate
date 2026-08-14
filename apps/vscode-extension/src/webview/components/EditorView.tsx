import { DashboardView } from "./dashboard/DashboardView";
import { OnboardingLayout } from "./onboarding-layout/OnboardingLayout";
import { VindicatePanelShell } from "./layout/VindicatePanelShell";
import { useOnboardingStore } from "../stores/onboardingStore";

export function EditorView() {
  const screen = useOnboardingStore((s) => s.screen);

  if (screen === "dashboard") {
    return (
      <VindicatePanelShell>
        <DashboardView />
      </VindicatePanelShell>
    );
  }

  return <OnboardingLayout />;
}

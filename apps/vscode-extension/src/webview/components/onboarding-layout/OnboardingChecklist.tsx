import { deriveChecklistSteps } from "../../lib/checklistSteps";
import { getExtensionVersion } from "../../lib/webviewAssets";
import { useOnboardingStore } from "../../stores/onboardingStore";
import type { Screen } from "../../../shared/messages";

const EXT_VERSION = getExtensionVersion();

// ── Step indicator icon ───────────────────────────────────────────────────────
function StepDot({ status, index }: { status: "done" | "active" | "locked"; index: number }) {
  if (status === "done") {
    return (
      <div className="vindicate-cl-dot vindicate-cl-dot--done" aria-hidden>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,7 5.5,10.5 12,4" />
        </svg>
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="vindicate-cl-dot vindicate-cl-dot--active" aria-hidden>
        <span>{index}</span>
      </div>
    );
  }
  return (
    <div className="vindicate-cl-dot vindicate-cl-dot--locked" aria-hidden>
      <span>{index}</span>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function OnboardingChecklist() {
  const screen = useOnboardingStore((s) => s.screen);
  const mode = useOnboardingStore((s) => s.mode);
  const completedSteps = useOnboardingStore((s) => s.completedSteps);
  const hasFolder = useOnboardingStore((s) => s.hasFolder);
  const onboardingDone = useOnboardingStore((s) => s.onboardingDone);
  const detectedTools = useOnboardingStore((s) => s.detectedTools);
  const confirmedTools = useOnboardingStore((s) => s.confirmedTools);
  const activePanelOverride = useOnboardingStore((s) => s.activePanelOverride);
  const setActivePanelOverride = useOnboardingStore((s) => s.setActivePanelOverride);

  const steps = deriveChecklistSteps({
    screen,
    completedSteps,
    mode,
    confirmedTools,
    detectedTools,
    hasFolder,
    onboardingDone,
    extensionVersion: EXT_VERSION
  });

  const panelScreenByStep: Record<number, Screen> = {
    2: "toolSelection",
    3: "modeSelection",
    4: "scaffold"
  };

  const handleStepClick = (index: number, clickable: boolean) => {
    if (!clickable) return;
    const target = panelScreenByStep[index];
    if (!target) return;
    const currentPanel = activePanelOverride ?? screen;
    setActivePanelOverride(currentPanel === target ? null : target);
  };

  return (
    <aside className="vindicate-cl-sidebar" aria-label="Setup progress">
      <p className="vindicate-cl-heading">GETTING STARTED</p>
      <div className="vindicate-cl-steps" role="list">
        {steps.map((step) => {
          const isDone = step.status === "done";
          const isActive = step.status === "active";
          const effectivePanel = activePanelOverride ?? screen;
          const isHighlighted =
            step.clickable && effectivePanel === panelScreenByStep[step.index];

          return (
            <div
              key={step.index}
              role="listitem"
              className={[
                "vindicate-cl-step",
                `vindicate-cl-step--${step.status}`,
                isHighlighted ? "vindicate-cl-step--highlighted" : "",
                step.clickable ? "vindicate-cl-step--clickable" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleStepClick(step.index, step.clickable)}
              tabIndex={step.clickable ? 0 : -1}
              onKeyDown={(e) => {
                if (step.clickable && (e.key === "Enter" || e.key === " ")) {
                  handleStepClick(step.index, step.clickable);
                }
              }}
              aria-current={isActive ? "step" : undefined}
            >
              <StepDot status={step.status} index={step.index} />
              <div className="vindicate-cl-step-body">
                <div className={[
                  "vindicate-cl-title",
                  isDone ? "vindicate-cl-title--done" : ""
                ].filter(Boolean).join(" ")}>
                  {step.title}
                </div>
                <div className="vindicate-cl-sub">{step.subtitle}</div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

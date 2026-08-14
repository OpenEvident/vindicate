import { Trash2, Check } from "lucide-react";
import { ActionBadge } from "@/components/recording/shared/ActionBadge";
import { LocatorPicker } from "@/components/recording/shared/LocatorPicker";
import { StrengthMeter } from "@/components/recording/shared/StrengthMeter";
import { LocatorHint } from "@/components/recording/shared/LocatorHint";
import { SnapshotHint } from "@/components/recording/shared/SnapshotHint";
import { NavigationStepHint } from "@/components/recording/shared/NavigationStepHint";
import { Pill } from "@/components/recording/ui/Pill";
import {
  formatSnapshotSummary,
  formatNavigationStepSummary,
  formatStepEnvVarLabel,
  getCandidateStrategyLabel,
  getNavigationTrigger,
  getStepPageSnapshot,
  getTargetLabel,
  isStepEnvVar
} from "@/lib/recording-formatters";
import { useRecordingStore } from "@/stores/recordingStore";
import type { RecordingStep, RecordingMode, LocatorCandidate } from "@/lib/recording-ui-types";

// ── Locator area sub-component ───────────────────────────────────────────────

interface StepCardLocatorAreaProps {
  readonly step: RecordingStep;
  readonly mode: RecordingMode;
  readonly isLocatorOpen: boolean;
}

function StepCardLocatorArea({ step, mode, isLocatorOpen }: StepCardLocatorAreaProps) {
  const setOpenLocator = useRecordingStore((s) => s.setOpenLocator);
  const chooseLocator  = useRecordingStore((s) => s.chooseLocator);

  if (mode === "recording") {
    // Show the recommended (or first) locator read-only during live recording
    const rec: LocatorCandidate | undefined =
      step.candidates.find((c) => c.recommended === true) ?? step.candidates[0];
    if (rec === undefined) return null;

    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="inline-flex items-center gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vs-text-dim">
              Locator
            </span>
            <LocatorHint />
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.06em] text-tone-emerald">
            <Check size={10} /> Recommended
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-vs-border bg-vs-hover px-2.5 py-2">
          <span className="shrink-0 rounded bg-vs-accent/20 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-vs-accent">
            {getCandidateStrategyLabel(rec)}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-vs-text">
            {rec.value}
          </span>
          <StrengthMeter {...(rec.strength !== undefined ? { strength: rec.strength } : {})} />
        </div>
      </div>
    );
  }

  return (
    <LocatorPicker
      candidates={step.candidates}
      chosen={step.chosen}
      disabled={mode === "finalized"}
      isOpen={isLocatorOpen}
      onToggle={() => setOpenLocator(isLocatorOpen ? null : step.seq)}
      onClose={() => setOpenLocator(null)}
      onChange={(chosen) => chooseLocator(step.seq, chosen)}
    />
  );
}

// ── StepCard ─────────────────────────────────────────────────────────────────

interface StepCardProps {
  readonly step: RecordingStep;
  readonly mode: RecordingMode;
  readonly selected: boolean;
  readonly isLocatorOpen: boolean;
}

export function StepCard({ step, mode, selected, isLocatorOpen }: StepCardProps) {
  const selectPreviewTarget = useRecordingStore((s) => s.selectPreviewTarget);
  const removeStep          = useRecordingStore((s) => s.removeStep);
  const updateStep          = useRecordingStore((s) => s.updateStep);
  const steps               = useRecordingStore((s) => s.steps);

  const isReview   = mode === "review";
  const isSnapshot = step.action === "snapshot";
  const isNavigate = step.action === "navigate";
  // Tab/popup actions carry no element candidates by design (see agent-step-builder.ts's
  // buildTabActionPayload / recording.service.ts's synthesized switch_tab_by_url steps) — they have no
  // "locator" concept to show, unlike a click/fill step that failed to capture one.
  const isTabAction =
    step.action === "new_tab" ||
    step.action === "switch_tab" ||
    step.action === "switch_tab_by_url" ||
    step.action === "close_tab";
  const hasValue   = step.action === "fill" || step.action === "select";
  const envVarMarked = step.action === "fill" && isStepEnvVar(step);
  const snapshotSummary = formatSnapshotSummary(getStepPageSnapshot(step));
  const navigationTrigger = isNavigate ? getNavigationTrigger(step) : undefined;
  const navigationSummary =
    isNavigate ? formatNavigationStepSummary(step, steps) : null;

  return (
    // Elevate above neighbours when locator dropdown is open
    <div className={isLocatorOpen ? "relative z-30" : "relative"}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => selectPreviewTarget({ type: "step", seq: step.seq })}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPreviewTarget({ type: "step", seq: step.seq }); } }}
        className={[
          "rounded-xl border cursor-pointer",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent",
          selected
            ? "border-vs-accent shadow-[0_8px_26px_-12px_color-mix(in_oklab,var(--color-vs-accent)_50%,transparent)]"
            : "border-vs-border hover:border-vs-accent/30",
        ].join(" ")}
      >
        {/* Top row */}
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <ActionBadge
            action={step.action}
            {...(navigationTrigger !== undefined ? { navigationTrigger } : {})}
          />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-vs-text" title={getTargetLabel(step)}>
            {isSnapshot
              ? <strong className="font-semibold">{getTargetLabel(step)}</strong>
              : getTargetLabel(step)
            }
          </span>
          {isSnapshot && snapshotSummary !== null && (
            <span className="shrink-0 rounded-full border border-vs-border bg-vs-hover/50 px-1.5 py-0.5 font-mono text-[9.5px] text-vs-text-dim">
              {snapshotSummary}
            </span>
          )}
          {envVarMarked && (
            <span title="Marked for .env / sensitive — masked in codegen">
              <Pill tone="amber">{formatStepEnvVarLabel(step)}</Pill>
            </span>
          )}
          {isReview && !isSnapshot && (
            <button
              type="button"
              aria-label={`Remove step ${step.seq}`}
              onClick={(e) => { e.stopPropagation(); removeStep(step.seq); }}
              className={[
                "inline-flex items-center gap-1 shrink-0 rounded-md border border-transparent",
                "px-2 py-1 text-ui-sm text-vs-text-dim cursor-pointer",
                "transition-all duration-120",
                "hover:border-tone-red/30 hover:bg-tone-red/10 hover:text-tone-red",
              ].join(" ")}
            >
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>

        {/* Typed / selected value */}
        {hasValue && step.text !== undefined && (
          <div className="px-3 pb-2.5">
            {mode === "review" ? (
              <>
                <input
                  type="text"
                  value={step.text}
                  aria-label="Step value"
                  onChange={(e) => updateStep({ ...step, text: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={[
                    "w-full rounded-md border border-vs-border px-2.5 py-1.5",
                    "font-mono text-[11.5px] text-vs-text bg-vs-input-bg outline-none",
                    "focus:border-vs-accent focus:shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-vs-accent)_16%,transparent)]",
                    "transition-all duration-150",
                  ].join(" ")}
                />
                {step.action === "fill" && (
                  <div className="mt-2 inline-flex max-w-full items-center gap-2 text-ui-sm text-vs-text-dim">
                    <input
                      type="checkbox"
                      checked={isStepEnvVar(step)}
                      onChange={(e) => updateStep({ ...step, envVar: e.target.checked })}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Mark as env var / sensitive"
                      className="cursor-pointer"
                    />
                    <span className="select-none">Env var / sensitive (advisory for codegen)</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={[
                  "min-w-0 truncate rounded-md border border-vs-border px-2.5 py-1.5",
                  "font-mono text-[11.5px] text-vs-text",
                  "bg-[color-mix(in_oklab,var(--color-vs-accent)_5%,var(--color-vs-hover))]",
                ].join(" ")}>
                  {envVarMarked ? "••••••••" : step.text}
                </div>
              </>
            )}
          </div>
        )}

        {/* Snapshot info */}
        {isSnapshot && (
          <div className="mx-3 mb-3 flex items-center gap-1.5 rounded-lg border border-tone-emerald/20 bg-tone-emerald/5 px-3 py-2 text-ui-sm text-vs-text-dim leading-relaxed">
            <span>Full page state captured. All element candidates are in the artifact.</span>
            <SnapshotHint />
          </div>
        )}

        {/* Navigation info */}
        {isNavigate && navigationSummary !== null && (
          <div
            className={[
              "mx-3 mb-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-ui-sm leading-relaxed",
              navigationTrigger === "implicit"
                ? "border-tone-amber/25 bg-tone-amber/5 text-vs-text-dim"
                : navigationTrigger === "explicit"
                  ? "border-tone-blue/25 bg-tone-blue/5 text-vs-text-dim"
                  : "border-vs-border bg-vs-hover/50 text-vs-text-dim",
            ].join(" ")}
          >
            <span>{navigationSummary}</span>
            <NavigationStepHint />
          </div>
        )}

        {/* Locator area — navigate and tab-switch steps record URL/tab changes, not element targets */}
        {!isSnapshot && !isNavigate && !isTabAction && (
          <div className="px-3 pb-3">
            <StepCardLocatorArea step={step} mode={mode} isLocatorOpen={isLocatorOpen} />
          </div>
        )}
      </div>
    </div>
  );
}

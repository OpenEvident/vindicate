import { useRef, useEffect, useCallback } from "react";
import { Check, ChevronDown } from "lucide-react";
import { StrengthMeter } from "./StrengthMeter";
import { LocatorHint } from "@/components/recording/shared/LocatorHint";
import { getCandidateStrategyLabel } from "@/lib/recording-formatters";
import type { LocatorCandidate } from "@/lib/recording-ui-types";

interface LocatorPickerProps {
  readonly candidates: readonly LocatorCandidate[];
  readonly chosen: LocatorCandidate | null;
  readonly disabled: boolean;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly onChange: (chosen: LocatorCandidate) => void;
}

export function LocatorPicker({
  candidates,
  chosen,
  disabled,
  isOpen,
  onToggle,
  onClose,
  onChange
}: LocatorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const resolved = chosen ?? candidates[0] ?? null;
  const recommended = candidates.find((c) => c.recommended === true);
  const isRecommendedChosen =
    resolved !== null &&
    recommended !== undefined &&
    resolved.strategy === recommended.strategy &&
    resolved.value === recommended.value;

  // Close on click-outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (candidates.length === 0) {
    return (
      <div className="rounded border border-dashed border-vs-border px-3 py-2 font-mono text-ui-sm text-vs-text-dim">
        No candidates captured
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Label row */}
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vs-text-dim">
            Locator
          </span>
          <LocatorHint />
        </span>
        {isRecommendedChosen && (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.06em] text-tone-emerald">
            <Check size={10} />
            Recommended
          </span>
        )}
      </div>

      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={onToggle}
        className={[
          "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left",
          "bg-vs-hover transition-all duration-150",
          "disabled:cursor-not-allowed disabled:opacity-60",
          isOpen
            ? "border-vs-accent shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-vs-accent)_16%,transparent)]"
            : "border-vs-border hover:border-vs-accent/40"
        ].join(" ")}
      >
        {resolved !== null && (
          <span className="shrink-0 rounded bg-vs-accent/20 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-vs-accent">
            {getCandidateStrategyLabel(resolved)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-vs-text">
          {resolved?.value ?? "Select locator"}
        </span>
        {resolved !== null && (
          <StrengthMeter
            {...(resolved.strength !== undefined ? { strength: resolved.strength } : {})}
          />
        )}
        <ChevronDown
          size={13}
          className={[
            "shrink-0 text-vs-text-dim transition-transform duration-150",
            isOpen ? "rotate-180" : ""
          ].join(" ")}
        />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <ul
          role="listbox"
          className={[
            "absolute left-0 right-0 top-[calc(100%+4px)] z-40",
            "rounded-lg border border-vs-accent bg-vs-bg py-1",
            "shadow-[0_18px_44px_-12px_rgba(0,0,0,0.6)]",
            "animate-pop"
          ].join(" ")}
        >
          {candidates.map((candidate) => {
            const optKey = `${candidate.strategy}:${candidate.value}`;
            const isSelected =
              resolved !== null &&
              resolved.strategy === candidate.strategy &&
              resolved.value === candidate.value;
            return (
              <li key={optKey} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={[
                    "flex w-full items-center gap-2.5 px-2.5 py-2 text-left",
                    "transition-colors duration-100",
                    isSelected ? "bg-vs-accent/15" : "hover:bg-vs-hover"
                  ].join(" ")}
                  onClick={() => onChange(candidate)}
                >
                  <span className="shrink-0 rounded bg-vs-input-bg px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-vs-accent">
                    {getCandidateStrategyLabel(candidate)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-vs-text">
                    {candidate.value}
                  </span>
                  {candidate.recommended === true && (
                    <span className="shrink-0 rounded-full bg-tone-emerald/15 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-tone-emerald">
                      Recommended
                    </span>
                  )}
                  <StrengthMeter
                    {...(candidate.strength !== undefined ? { strength: candidate.strength } : {})}
                  />
                  {isSelected && <Check size={12} className="shrink-0 text-vs-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

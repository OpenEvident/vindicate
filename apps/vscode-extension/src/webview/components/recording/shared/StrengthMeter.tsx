import { Tooltip } from "@/components/recording/ui/Tooltip";
import { STRENGTH_META } from "@/lib/recording-constants";
import type { LocatorStrength } from "@/lib/recording-ui-types";

interface StrengthMeterProps {
  readonly strength?: LocatorStrength;
}

const DEFAULT_STRENGTH: LocatorStrength = "medium";

const STRENGTH_DESCRIPTIONS: Record<LocatorStrength, string> = {
  strong: "Stable. Won't break when the UI changes.",
  medium: "Might break if the element moves.",
  weak:   "Likely to break. Try a different locator.",
};

// Three bars of increasing height — lit bars colored by strength tone.
export function StrengthMeter({ strength = DEFAULT_STRENGTH }: StrengthMeterProps) {
  const meta = STRENGTH_META[strength];
  const heights = ["h-1.5", "h-2.5", "h-3.5"] as const;

  return (
    <Tooltip content={STRENGTH_DESCRIPTIONS[strength]} side="top">
      <span
        className="inline-flex items-end gap-0.5 shrink-0 h-3.5"
        aria-label={`Selector strength: ${meta.label}`}
      >
        {heights.map((h, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={[
              "w-0.5 rounded-sm",
              i < meta.bars ? meta.colorClass : "bg-vs-border",
              h,
            ].join(" ")}
          />
        ))}
      </span>
    </Tooltip>
  );
}

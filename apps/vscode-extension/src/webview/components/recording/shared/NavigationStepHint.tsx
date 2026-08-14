import { HintPopover } from "@/components/recording/ui/HintPopover";
import type { PopperSide } from "@/lib/geometry";

interface NavigationStepHintProps {
  readonly side?: PopperSide;
}

export function NavigationStepHint({ side = "bottom" }: NavigationStepHintProps) {
  return (
    <HintPopover
      title="Manual vs automatic navigation"
      body="Manual navigations are direct URL changes (entry page, address bar, or an explicit link). Automatic navigations happen because the previous step triggered a page change — for example after a click or submit. Pre-condition replay treats them differently."
      side={side}
    />
  );
}

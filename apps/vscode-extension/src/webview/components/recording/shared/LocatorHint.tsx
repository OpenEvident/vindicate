import { HintPopover } from "@/components/recording/ui/HintPopover";
import type { PopperSide } from "@/lib/geometry";

interface LocatorHintProps {
  readonly side?: PopperSide;
}

export function LocatorHint({ side = "bottom" }: LocatorHintProps) {
  return (
    <HintPopover
      title="What is a locator?"
      body="The selector used to find this element when the test runs. Pick the highest-stability strategy so it survives page changes."
      side={side}
    />
  );
}

import { HintPopover } from "@/components/recording/ui/HintPopover";
import type { PopperSide } from "@/lib/geometry";

interface SnapshotHintProps {
  readonly side?: PopperSide;
}

export function SnapshotHint({ side = "bottom" }: SnapshotHintProps) {
  return (
    <HintPopover
      title="What is a snapshot?"
      body="Captures the full page state and all element candidates at that moment. Take one before a navigation, page refresh, or form submission — anything that changes the page. The final snapshot is taken automatically when you stop."
      side={side}
    />
  );
}

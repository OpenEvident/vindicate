import type { StepId } from "./types";

const STEP_ARTIFACT: Record<StepId, string> = {
  1: ".vindicate/domain.md",
  2: ".vindicate/context.md",
  3: ".vindicate/stories/*.story.md",
  4: "linked test files"
};

export function stepRevokedMessage(step: StepId): string {
  return `Step ${step} reopened — ${STEP_ARTIFACT[step]} is missing`;
}

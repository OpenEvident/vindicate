import { describe, expect, it } from "vitest";

import { assertInteractiveScoreInvariant, scoreElement } from "./element-scorer.js";

const DEPTHS = [0, 1, 5, 10, 20] as const;

describe("element-scorer", () => {
  it("holds interactive ≥ non-interactive invariant at depths 0 and 20", () => {
    for (const depth of DEPTHS) {
      const interactiveScore = scoreElement({
        isInteractive: true,
        hasAccessibleName: false,
        inViewport: false,
        hasTestid: false,
        domDepth: depth
      });
      const nonInteractiveScore = scoreElement({
        isInteractive: false,
        hasAccessibleName: true,
        inViewport: true,
        hasTestid: false,
        domDepth: depth
      });
      assertInteractiveScoreInvariant(interactiveScore, true);
      assertInteractiveScoreInvariant(nonInteractiveScore, false);
      expect(interactiveScore).toBeGreaterThanOrEqual(nonInteractiveScore);
    }
  });

  it("scores interactive floor at 40 and non-interactive ceiling at 40 across depths", () => {
    for (const depth of DEPTHS) {
      const bareInteractive = scoreElement({
        isInteractive: true,
        hasAccessibleName: false,
        inViewport: false,
        hasTestid: false,
        domDepth: depth
      });
      const maxNonInteractive = scoreElement({
        isInteractive: false,
        hasAccessibleName: true,
        inViewport: true,
        hasTestid: false,
        domDepth: depth
      });
      expect(bareInteractive).toBeGreaterThanOrEqual(40);
      expect(maxNonInteractive).toBeLessThanOrEqual(40);
    }
  });
});

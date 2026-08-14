/**
 * @file Knapsack scoring for snapshot node cap (BROWSER-SERVICE §1.8).
 */
export interface ElementScoreInput {
  readonly isInteractive: boolean;
  readonly hasAccessibleName: boolean;
  readonly inViewport: boolean;
  readonly hasTestid: boolean;
  readonly domDepth: number;
}

export function scoreElement(input: ElementScoreInput): number {
  const depthPenalty = Math.min(input.domDepth * 2, 10);
  return (
    (input.isInteractive ? 50 : 0) +
    (input.hasAccessibleName ? 20 : 0) +
    (input.inViewport ? 20 : 0) +
    (input.hasTestid ? 10 : 0) -
    depthPenalty
  );
}

/** Invariant checks for AI test generation (BROWSER-SERVICE §1.8). */
export function assertInteractiveScoreInvariant(score: number, isInteractive: boolean): void {
  if (isInteractive && score < 40) {
    throw new Error(`Invariant violated: interactive score ${score} < 40`);
  }
  if (!isInteractive && score > 40) {
    throw new Error(`Invariant violated: non-interactive score ${score} > 40`);
  }
}

/**
 * @file Pure test design types and diff helpers for design-approval panel.
 */

export type DesignCase = { readonly title: string };
export type DesignSuite = { readonly title: string; readonly cases: DesignCase[] };
export type DesignBadge = "added" | "modified" | "removed";

export type TestDesignState = {
  suites: DesignSuite[];
  write_plan?: string;
  dry_run?: boolean;
  badges: Record<string, DesignBadge>;
};

export function emptyDesignState(): TestDesignState {
  return { suites: [], badges: {} };
}

function casesBySuite(suites: DesignSuite[]): Map<string, string[]> {
  return new Map(suites.map((s) => [s.title, s.cases.map((c) => c.title)]));
}

/** Diff previous suites against next; badges keyed by case title. */
export function diffDesign(
  previous: DesignSuite[] | undefined,
  next: DesignSuite[]
): Record<string, DesignBadge> {
  const badges: Record<string, DesignBadge> = {};

  if (previous === undefined || previous.length === 0) {
    for (const suite of next) {
      for (const c of suite.cases) {
        badges[c.title] = "added";
      }
    }
    return badges;
  }

  const prevBySuite = casesBySuite(previous);
  const nextBySuite = casesBySuite(next);

  for (const [suiteTitle, prevCases] of prevBySuite) {
    const nextCases = nextBySuite.get(suiteTitle);
    if (nextCases === undefined) {
      for (const title of prevCases) {
        badges[title] = "removed";
      }
      continue;
    }

    const matchedNext = new Set<number>();
    const len = Math.max(prevCases.length, nextCases.length);
    for (let i = 0; i < len; i++) {
      const prevTitle = prevCases[i];
      const nextTitle = nextCases[i];
      if (prevTitle === undefined && nextTitle !== undefined) {
        badges[nextTitle] = "added";
        matchedNext.add(i);
      } else if (prevTitle !== undefined && nextTitle === undefined) {
        badges[prevTitle] = "removed";
      } else if (
        prevTitle !== undefined &&
        nextTitle !== undefined &&
        prevTitle !== nextTitle
      ) {
        badges[prevTitle] = "removed";
        badges[nextTitle] = "modified";
        matchedNext.add(i);
      } else if (prevTitle !== undefined && nextTitle !== undefined) {
        matchedNext.add(i);
      }
    }

    const prevSet = new Set(prevCases);
    for (let i = 0; i < nextCases.length; i++) {
      if (matchedNext.has(i)) {
        continue;
      }
      const title = nextCases[i]!;
      if (!prevSet.has(title)) {
        badges[title] = "added";
      }
    }
  }

  for (const [suiteTitle, nextCases] of nextBySuite) {
    if (!prevBySuite.has(suiteTitle)) {
      for (const title of nextCases) {
        badges[title] = "added";
      }
    }
  }

  return badges;
}

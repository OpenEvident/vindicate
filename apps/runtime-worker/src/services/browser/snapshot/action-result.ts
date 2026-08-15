/**
 * @file Post-action `action_result` inference (BROWSER-SERVICE §1.12).
 */
export type PageChangeLevel = "navigation" | "round_trip" | "significant" | "minor" | "none";
export type ActionRecommendation = "snapshot" | "diff" | "none";

export interface ActionResultPayload {
  readonly event: "action_result";
  readonly page_change: PageChangeLevel;
  readonly recommendation: ActionRecommendation;
  readonly url_before?: string;
  readonly url_after?: string;
  readonly url_trail?: readonly string[];
  readonly hint?: string;
  readonly settle_timed_out?: boolean;
}

export function buildActionResult(input: {
  readonly urlBefore: string;
  readonly urlAfter: string;
  readonly urlTrail?: readonly string[];
  readonly timedOut: boolean;
}): ActionResultPayload {
  const urlTrail = input.urlTrail?.filter((url) => url.length > 0) ?? [];
  const navigated = input.urlBefore !== input.urlAfter;
  const roundTrip =
    !navigated && urlTrail.length > 1 && urlTrail.some((url) => url !== input.urlBefore);
  const page_change: PageChangeLevel = navigated
    ? "navigation"
    : roundTrip
      ? "round_trip"
      : input.timedOut
        ? "significant"
        : "minor";
  const recommendation: ActionRecommendation =
    page_change === "navigation" || page_change === "round_trip" || page_change === "significant"
      ? "snapshot"
      : "diff";
  return {
    event: "action_result",
    page_change,
    recommendation,
    ...(input.urlBefore.length > 0 ? { url_before: input.urlBefore } : {}),
    ...(input.urlAfter.length > 0 ? { url_after: input.urlAfter } : {}),
    ...(urlTrail.length > 0 ? { url_trail: urlTrail } : {}),
    ...(page_change === "round_trip"
      ? {
          hint: "Navigated away and returned to the same URL — call browser_read before the next action. When authoring tests, pair this submit with waitForResponse on the endpoint seen in url_trail."
        }
      : {}),
    ...(input.timedOut ? { settle_timed_out: true } : {})
  };
}

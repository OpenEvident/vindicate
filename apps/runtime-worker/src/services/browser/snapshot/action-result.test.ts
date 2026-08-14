import { describe, expect, it } from "vitest";

import { buildActionResult } from "./action-result.js";

describe("action-result", () => {
  it("classifies navigation by URL change", () => {
    const r = buildActionResult({
      urlBefore: "https://a/",
      urlAfter: "https://b/",
      urlTrail: ["https://a/", "https://b/"],
      timedOut: false
    });
    expect(r.page_change).toBe("navigation");
    expect(r.recommendation).toBe("snapshot");
    expect(r.url_before).toBe("https://a/");
    expect(r.url_after).toBe("https://b/");
    expect(r.url_trail).toEqual(["https://a/", "https://b/"]);
    expect(r.settle_timed_out).toBeUndefined();
  });

  it("classifies as round_trip when action leaves and returns to the same URL", () => {
    const r = buildActionResult({
      urlBefore: "https://x/login",
      urlAfter: "https://x/login",
      urlTrail: ["https://x/login", "https://x/auth", "https://x/login"],
      timedOut: false
    });
    expect(r.page_change).toBe("round_trip");
    expect(r.recommendation).toBe("snapshot");
    expect(r.hint).toContain("Navigated away and returned to the same URL");
  });

  it("classifies as significant when settle timed out", () => {
    const r = buildActionResult({ urlBefore: "https://x/", urlAfter: "https://x/", timedOut: true });
    expect(r.page_change).toBe("significant");
    expect(r.recommendation).toBe("snapshot");
    expect(r.settle_timed_out).toBe(true);
  });

  it("classifies as minor when settled cleanly with no navigation", () => {
    const r = buildActionResult({ urlBefore: "https://x/", urlAfter: "https://x/", timedOut: false });
    expect(r.page_change).toBe("minor");
    expect(r.recommendation).toBe("diff");
    expect(r.settle_timed_out).toBeUndefined();
  });
});

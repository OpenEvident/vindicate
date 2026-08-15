import { describe, expect, it } from "vitest";

import { formatNavigationFailure } from "./navigation-error.js";

describe("formatNavigationFailure", () => {
  it("parses HTTP status from Playwright-style messages", () => {
    const details = formatNavigationFailure(
      new Error(
        "page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://example.com/ — Response: 404 Not Found"
      )
    );
    expect(details.status).toBe(404);
    expect(details.message).toContain("404");
  });

  it("reads numeric status from error objects when present", () => {
    const err = Object.assign(new Error("navigation blocked"), { status: 503 });
    expect(formatNavigationFailure(err).status).toBe(503);
  });
});

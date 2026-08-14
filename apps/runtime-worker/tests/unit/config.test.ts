import { describe, expect, it } from "vitest";

import { config } from "../../src/core/config.js";

describe("config", () => {
  it("defaults worker port to 9121", () => {
    expect(config.VINDICATE_WORKER_PORT).toBe(9121);
  });

  it("requires VINDICATE_INTERNAL_KEY with at least 32 characters", () => {
    expect(config.VINDICATE_INTERNAL_KEY.length).toBeGreaterThanOrEqual(32);
  });
});

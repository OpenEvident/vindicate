import { describe, expect, it } from "vitest";
import fs from "node:fs";

import { listWorkerSamplePaths } from "./sample-fixtures.js";

describe("sample-fixtures", () => {
  it("resolves readable built-in sample paths", () => {
    for (const samplePath of Object.values(listWorkerSamplePaths())) {
      expect(fs.existsSync(samplePath)).toBe(true);
    }
  });
});

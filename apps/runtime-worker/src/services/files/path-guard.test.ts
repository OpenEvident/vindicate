import { describe, expect, it } from "vitest";

import { FilesOutsideRootError } from "../../shared/errors/worker.errors.js";
import { resolveProjectPath } from "./path-guard.js";

describe("resolveProjectPath", () => {
  it("resolves paths inside root", () => {
    const p = resolveProjectPath("C:\\repo", "src/index.ts");
    expect(p.replace(/\\/g, "/")).toContain("/repo/");
  });

  it("rejects path traversal", () => {
    expect(() => resolveProjectPath("C:\\repo", "..\\secret")).toThrow(FilesOutsideRootError);
  });
});

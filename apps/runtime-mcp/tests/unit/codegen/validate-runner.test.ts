import { afterEach, describe, expect, it } from "vitest";

import { runValidate } from "../../../src/codegen/validate-runner.js";
import { fullSchema } from "./helpers/fixtures.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

describe("validate-runner", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  it("validates create target with inline schema", async () => {
    const { fs } = await createProjectRoot();
    const result = runValidate(fs, {
      mode: "validate",
      validateTarget: "create",
      feature: "login",
      schema: fullSchema()
    });
    expect(result.valid).toBe(true);
  });

  it("returns schema_shape when schema is missing for create", async () => {
    const { fs } = await createProjectRoot();
    const result = runValidate(fs, {
      mode: "validate",
      validateTarget: "create",
      feature: "login"
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "schema_shape", path: "schema" })
    ]);
  });

  it("rejects unsupported validateTarget values", async () => {
    const { fs } = await createProjectRoot();
    const result = runValidate(fs, {
      mode: "validate",
      validateTarget: "add_test_cases" as "create",
      feature: "login",
      cases: []
    } as Parameters<typeof runValidate>[1]);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "schema_shape", path: "validateTarget" })
    ]);
  });
});

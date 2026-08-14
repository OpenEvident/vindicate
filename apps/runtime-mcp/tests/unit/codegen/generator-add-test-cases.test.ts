import { afterEach, describe, expect, it } from "vitest";

import { runGenerator } from "../../../src/codegen/generator.js";
import { CodegenStructuralError } from "../../../src/shared/errors.js";
import { fullSchema } from "./helpers/fixtures.js";
import { expectWritten } from "./helpers/expect-written.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

describe("generator add_test_cases", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  async function seedLoginProject() {
    const ctx = await createProjectRoot();
    await runGenerator(ctx.fs, { mode: "create", feature: "login", schema: fullSchema() });
    return ctx;
  }

  it("ATC1 — appends new test to spec", async () => {
    const { fs } = await seedLoginProject();
    const result = expectWritten(await runGenerator(fs, {
      mode: "add_test_cases",
      feature: "login",
      cases: [
        {
          ac_id: "AC-9",
          scenario: "Extra",
          title: "[AC-9] should do more",
          body: [{ fixture: "loginPage", call: "step_navigate" }]
        }
      ]
    }));
    const spec = await fs.read("tests/login.spec.ts");
    expect(spec).toContain("[AC-9]");
    expect(result.filesWritten).toEqual(["tests/login.spec.ts"]);
  });

  it("ATC2 — does not write schema file", async () => {
    const { fs } = await seedLoginProject();
    const result = expectWritten(await runGenerator(fs, {
      mode: "add_test_cases",
      feature: "login",
      cases: [
        {
          ac_id: "AC-9",
          scenario: "Extra",
          title: "[AC-9] should do more",
          body: [{ fixture: "loginPage", call: "step_navigate" }]
        }
      ]
    }));
    expect(result.filesWritten).not.toContain(".vindicate/schemas/login.json");
  });

  it("ATC3 — leaves existing tests intact", async () => {
    const { fs } = await seedLoginProject();
    const before = await fs.read("tests/login.spec.ts");
    await runGenerator(fs, {
      mode: "add_test_cases",
      feature: "login",
      cases: [
        {
          ac_id: "AC-9",
          scenario: "Extra",
          title: "[AC-9] should do more",
          body: [{ fixture: "loginPage", call: "step_navigate" }]
        }
      ]
    });
    const after = await fs.read("tests/login.spec.ts");
    expect(after).toContain("[AC-1]");
    expect(before).toContain("[AC-1]");
  });

  it("ATC4 — fails when spec file is missing", async () => {
    const { fs } = await createProjectRoot();
    await expect(
      runGenerator(fs, {
        mode: "add_test_cases",
        feature: "login",
        cases: [
          {
            ac_id: "AC-9",
            scenario: "Extra",
            title: "[AC-9] should do more",
            body: [{ fixture: "loginPage", call: "step_navigate" }]
          }
        ]
      })
    ).rejects.toThrow(CodegenStructuralError);
  });
});

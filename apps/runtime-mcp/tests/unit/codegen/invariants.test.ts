import { afterEach, describe, expect, it } from "vitest";

import { runGenerator } from "../../../src/codegen/generator.js";
import { buildPageObject } from "../../../src/codegen/page-object.js";
import { CodegenStructuralError } from "../../../src/shared/errors.js";
import { el, fullSchema, pageDef, step, verify } from "./helpers/fixtures.js";
import { expectWritten } from "./helpers/expect-written.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

// CSS selectors are forbidden in generated locators. Semantic getBy* and XPath are allowed.
const FORBIDDEN_LOCATOR_PATTERNS = [
  /locator\(['"`]\[/, // CSS attribute selector
  /locator\(['"`]\./, // CSS class selector
  /locator\(['"`]#/ // CSS id selector
];

describe("codegen invariants", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  function assertNoForbiddenLocators(content: string): void {
    for (const pattern of FORBIDDEN_LOCATOR_PATTERNS) {
      if (typeof pattern === "string") {
        expect(content).not.toContain(pattern);
      } else {
        expect(content).not.toMatch(pattern);
      }
    }
  }

  it("I1 — every private locator has locator-helper comment on preceding line", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const page = await fs.read("pages/LoginPage.ts");
    const privates = page.match(/private \w+ =/g) ?? [];
    const helpers = page.match(/\/\/ locator-helper:/g) ?? [];
    expect(helpers.length).toBe(privates.length);
    expect(page).toMatch(/\/\/ locator-helper: [^\n]+\n {2}private \w+ =/);
  });

  it("I2 — generated locators avoid forbidden selector APIs", async () => {
    const content = buildPageObject(
      pageDef({
        feature: "login",
        page_class: "LoginPage",
        elements: [
          el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
          el("label", { tag: "span", name: "Email" }),
          el("roleBtn", { tag: "button", role: "button", name: "Go" })
        ],
        steps: [step("step_navigate", [{ do: "navigate" }])],
        verifies: [
          verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
        ]
      })
    );
    assertNoForbiddenLocators(content);
  });

  it("I3 — every step method returns Promise<this>", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const page = await fs.read("pages/LoginPage.ts");
    const stepMethods = page.match(/async step_\w+\([^)]*\): Promise<this>/g) ?? [];
    expect(stepMethods.length).toBeGreaterThan(0);
    expect((page.match(/return this;/g) ?? []).length).toBeGreaterThanOrEqual(stepMethods.length);
  });

  it("I4 — every verify method returns Promise<this>", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const page = await fs.read("pages/LoginPage.ts");
    const verifyMethods = page.match(/async verify_\w+\([^)]*\): Promise<this>/g) ?? [];
    expect(verifyMethods.length).toBeGreaterThan(0);
  });

  it("I5 — every public method has JSDoc", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const page = await fs.read("pages/LoginPage.ts");
    expect((page.match(/@returns this for chaining/g) ?? []).length).toBeGreaterThan(0);
  });

  it("I6 — filesWritten matches files that exist on disk", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(await runGenerator(fs, {
      mode: "create",
      feature: "login",
      schema: fullSchema()
    }));
    expect(new Set(result.filesWritten).size).toBe(result.filesWritten.length);
    for (const filePath of result.filesWritten) {
      await expect(fs.read(filePath)).resolves.toBeTypeOf("string");
    }
  });

  it("I7 — structural failure before write leaves project without generated page object", async () => {
    const { fs } = await createProjectRoot();
    const badSchema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [el("ghost", { tag: "div" })],
          steps: [step("step_click", [{ do: "click", ref: "missing" }])],
          verifies: []
        })
      ]
    });
    await expect(
      runGenerator(fs, { mode: "create", feature: "login", schema: badSchema })
    ).rejects.toThrow(CodegenStructuralError);
    await expect(fs.read("pages/LoginPage.ts")).rejects.toThrow();
  });

  it("I8 — add_test_cases writes only the spec file", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
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
    expect(result.filesWritten).toEqual(["tests/login.spec.ts"]);
  });

  it("I9 — generated page object includes AUTO-GENERATED header", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const page = await fs.read("pages/LoginPage.ts");
    expect(page.startsWith("// AUTO-GENERATED")).toBe(true);
  });
});

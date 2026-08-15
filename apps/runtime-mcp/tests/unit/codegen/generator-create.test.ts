import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { runGenerator } from "../../../src/codegen/generator.js";
import { CodegenStructuralError } from "../../../src/shared/errors.js";
import { fullSchema, pageDef, step, verify, el, testCase } from "./helpers/fixtures.js";
import { expectWritten } from "./helpers/expect-written.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

const SCAFFOLD_PAGE_CONFIG = readFileSync(
  path.join(process.cwd(), "content", "templates", "ui", "support", "config", "page.config.ts"),
  "utf8"
);

describe("generator create", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  it("G1 — owned_by filter writes only feature-owned page objects", async () => {
    const { fs } = await createProjectRoot();
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [el("e1", { tag: "button", testid: "go", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "e1", matcher: "toBeVisible" }])
          ]
        }),
        pageDef({
          feature: "dashboard",
          page_class: "DashboardPage",
          owned_by: "dashboard",
          path: "/dashboard",
          elements: [el("e2", { tag: "h1", role: "heading", name: "Dash" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "e2", matcher: "toBeVisible" }])
          ]
        })
      ]
    });

    const result = expectWritten(
      await runGenerator(fs, { mode: "create", feature: "login", schema })
    );
    expect(result.filesWritten).toContain("pages/LoginPage.ts");
    expect(result.filesWritten).not.toContain("pages/DashboardPage.ts");
  });

  it("G2 — filesWritten lists only files actually written", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    for (const path of result.filesWritten) {
      await expect(fs.read(path)).resolves.toBeTypeOf("string");
    }
  });

  it("G3 — does not persist schema to .vindicate/schemas/", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    expect(result.filesWritten).not.toContain(".vindicate/schemas/login.json");
    await expect(fs.read(".vindicate/schemas/login.json")).rejects.toThrow();
  });

  it("G3b — create refuses when spec already exists without overwrite", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    await expect(
      runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("G3c — create with overwrite:true regenerates feature files", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema(),
        overwrite: true
      })
    );
    expect(result.filesWritten).toContain("tests/login.spec.ts");
  });

  it("G4 — page object path is pages/<PageClass>.ts", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    expect(result.filesWritten).toContain("pages/LoginPage.ts");
  });

  it("G5 — spec written to tests/<feature>.spec.ts", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    expect(result.filesWritten).toContain("tests/login.spec.ts");
  });

  it("G6 — expected block writes support/data/<feature>/expected.json and barrel export", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema({ expected: { pageTitle: "Welcome" } })
      })
    );
    expect(result.filesWritten).toContain("support/data/login/expected.json");
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).toContain("loginExpected");
  });

  it("G7 — no expected block skips data file and barrel export", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    expect(result.filesWritten).not.toContain("support/data/login/expected.json");
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).not.toContain("loginExpected");
  });

  it("G8 — panel without expected does not emit data export", async () => {
    const { fs } = await createProjectRoot();
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "dash",
          page_class: "NavPanel",
          owned_by: "dash",
          is_panel: true,
          path: undefined,
          elements: [el("home", { tag: "button", role: "button", name: "Home" })],
          steps: [step("step_open", [{ do: "click", ref: "home" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "home", matcher: "toBeVisible" }])
          ]
        })
      ],
      spec: {
        suite: "App - Dash",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          {
            ac_id: "AC-1",
            scenario: "Open",
            title: "[AC-1] should open panel",
            body: [{ fixture: "navPanel", call: "step_open" }]
          }
        ]
      }
    });
    const result = expectWritten(
      await runGenerator(fs, { mode: "create", feature: "dash", schema })
    );
    expect(result.filesWritten).not.toContain("support/data/dash/expected.json");
  });

  it("G9 — generates_storage_state populates GeneratorResult.notice", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema({
          spec: {
            suite: "App - Login",
            generates_storage_state: "playwright/.auth/user.json",
            storage_state: null,
            before_each: null,
            cases: [
              {
                ac_id: "AC-1",
                scenario: "Auth",
                title: "[AC-1] should authenticate",
                body: [{ fixture: "loginPage", call: "step_navigate" }]
              }
            ]
          }
        })
      })
    );
    expect(result.notice).toContain("playwright.config.ts");
    expect(result.filesWritten).toContain("auth.setup.ts");
  });

  it("G10 — no generates_storage_state leaves notice undefined", async () => {
    const { fs } = await createProjectRoot();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "create",
        feature: "login",
        schema: fullSchema()
      })
    );
    expect(result.notice).toBeUndefined();
  });

  it("G11 — page export appended after Page Objects anchor", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).toContain("// ── Page Objects");
    expect(loader).toContain("export { LoginPage }");
  });

  it("G12 — panel export appended after Panels anchor", async () => {
    const { fs } = await createProjectRoot();
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "dash",
          page_class: "NavPanel",
          owned_by: "dash",
          is_panel: true,
          path: undefined,
          elements: [el("home", { tag: "button", role: "button", name: "Home" })],
          steps: [step("step_open", [{ do: "click", ref: "home" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "home", matcher: "toBeVisible" }])
          ]
        })
      ],
      spec: {
        suite: "App - Dash",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          {
            ac_id: "AC-1",
            scenario: "Open",
            title: "[AC-1] should open panel",
            body: [{ fixture: "navPanel", call: "step_open" }]
          }
        ]
      }
    });
    await runGenerator(fs, { mode: "create", feature: "dash", schema });
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).toContain("// ── Panels");
    expect(loader).toContain("export { NavPanel }");
  });

  it("G13 — expected data export appended after Test Data anchor", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, {
      mode: "create",
      feature: "login",
      schema: fullSchema({ expected: { title: "Hi" } })
    });
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).toContain("// ── Test Data");
    expect(loader).toContain("loginExpected");
  });

  it("G14 — page.config receives import, type, and fixture impl", async () => {
    const { fs } = await createProjectRoot();
    await runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() });
    const config = await fs.read("support/config/page.config.ts");
    expect(config).toContain("import { LoginPage } from './page-loader';");
    expect(config).toContain("loginPage: LoginPage;");
    expect(config).toContain("loginPage: async ({ page }, use)");
  });

  it("G15 — missing barrel anchor throws CodegenStructuralError", async () => {
    const { fs } = await createProjectRoot();
    await fs.write("support/config/page-loader.ts", "// scaffold file without anchor comments\n");
    await expect(
      runGenerator(fs, { mode: "create", feature: "login", schema: fullSchema() })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("G16 — multi-page create registers all fixtures on scaffold page.config template", async () => {
    const { fs } = await createProjectRoot();
    await fs.write("support/config/page.config.ts", SCAFFOLD_PAGE_CONFIG);

    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "LoginPage",
          owned_by: "auth",
          path: "/login",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_login", [{ do: "navigate" }, { do: "click", ref: "email" }])],
          verifies: []
        }),
        pageDef({
          feature: "auth",
          page_class: "HomePage",
          owned_by: "auth",
          path: "/",
          elements: [el("dash", { tag: "a", role: "link", name: "Dashboard" })],
          steps: [],
          verifies: [
            verify("verify_logged_in", [
              { subject: "element", ref: "dash", matcher: "toBeVisible" }
            ])
          ]
        })
      ],
      spec: {
        suite: "Authentication",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          testCase("AC-1", {
            body: [
              { fixture: "loginPage", call: "step_login" },
              { fixture: "homePage", call: "verify_logged_in" }
            ]
          })
        ]
      }
    });

    await runGenerator(fs, { mode: "create", feature: "auth", schema });
    const config = await fs.read("support/config/page.config.ts");
    expect(config).toContain("loginPage: LoginPage;");
    expect(config).toContain("homePage: HomePage;");
    expect(config).toContain("loginPage: async ({ page }, use)");
    expect(config).toContain("homePage: async ({ page }, use)");
  });

  it("G17 — create rejects spec-used pages when owned_by mismatches feature", async () => {
    const { fs } = await createProjectRoot();
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "LoginPage",
          owned_by: "loginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      ],
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          testCase("AC-1", {
            body: [{ fixture: "loginPage", call: "step_navigate" }]
          })
        ]
      }
    });

    await expect(runGenerator(fs, { mode: "create", feature: "auth", schema })).rejects.toThrow(
      CodegenStructuralError
    );
  });
});

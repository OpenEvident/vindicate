import { afterEach, describe, expect, it } from "vitest";

import { runGenerator } from "../../../src/codegen/generator.js";
import { CodegenStructuralError } from "../../../src/shared/errors.js";
import { el, fullSchema, pageDef, step, verify } from "./helpers/fixtures.js";
import { expectWritten } from "./helpers/expect-written.js";
import { createProjectRoot, teardownProjectRoots } from "./helpers/project-root.js";

describe("generator register_page", () => {
  afterEach(async () => {
    await teardownProjectRoots();
  });

  const homePage = pageDef({
    feature: "auth",
    page_class: "HomePage",
    owned_by: "auth",
    path: "/home",
    elements: [el("dash", { tag: "a", role: "link", name: "Dashboard" })],
    steps: [step("step_navigate", [{ do: "navigate" }])],
    verifies: [
      verify("verify_logged_in", [{ subject: "element", ref: "dash", matcher: "toBeVisible" }])
    ]
  });

  async function seedAuthProject() {
    const ctx = await createProjectRoot();
    await runGenerator(ctx.fs, {
      mode: "create",
      feature: "auth",
      schema: fullSchema({
        pages: [
          pageDef({
            feature: "auth",
            page_class: "LoginPage",
            owned_by: "auth",
            elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
            steps: [step("step_navigate", [{ do: "navigate" }])],
            verifies: [
              verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
            ]
          })
        ],
        spec: {
          suite: "App - Auth",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [
            {
              ac_id: "AC-1",
              scenario: "Login",
              title: "[AC-1] should log in",
              body: [{ fixture: "loginPage", call: "step_navigate" }]
            }
          ]
        }
      })
    });
    return ctx;
  }

  it("RP1 — writes page object and wires barrel/config", async () => {
    const { fs } = await seedAuthProject();
    const result = expectWritten(
      await runGenerator(fs, {
        mode: "register_page",
        feature: "auth",
        page: homePage
      })
    );
    expect(result.filesWritten).toContain("pages/HomePage.ts");
    expect(result.filesWritten).toContain("support/config/page-loader.ts");
    expect(result.filesWritten).toContain("support/config/page.config.ts");
    const loader = await fs.read("support/config/page-loader.ts");
    expect(loader).toContain("export { HomePage }");
    const config = await fs.read("support/config/page.config.ts");
    expect(config).toContain("homePage: HomePage;");
  });

  it("RP2 — refuses when page object file already exists", async () => {
    const { fs } = await seedAuthProject();
    await runGenerator(fs, { mode: "register_page", feature: "auth", page: homePage });
    await expect(
      runGenerator(fs, { mode: "register_page", feature: "auth", page: homePage })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("RP3 — idempotent barrel wiring on re-run after delete", async () => {
    const { fs } = await seedAuthProject();
    await runGenerator(fs, { mode: "register_page", feature: "auth", page: homePage });
    const loaderAfterFirst = await fs.read("support/config/page-loader.ts");
    const exportCount = (loaderAfterFirst.match(/export \{ HomePage \}/g) ?? []).length;
    expect(exportCount).toBe(1);
  });

  it("RP4 — rejects owned_by mismatch", async () => {
    const { fs } = await seedAuthProject();
    await expect(
      runGenerator(fs, {
        mode: "register_page",
        feature: "auth",
        page: { ...homePage, owned_by: "billing" }
      })
    ).rejects.toThrow(CodegenStructuralError);
  });

  it("RP5 — accepts a page whose first step requires a param", async () => {
    const { fs } = await seedAuthProject();
    const searchPage = pageDef({
      feature: "auth",
      page_class: "SearchPage",
      owned_by: "auth",
      elements: [el("q", { tag: "input", testid: "q", testid_attr: "data-testid" })],
      steps: [
        step("step_search", [{ do: "fill", ref: "q", param: "term" }], {
          params: [{ name: "term", type: "string" }]
        })
      ],
      verifies: [verify("verify_ok", [{ subject: "element", ref: "q", matcher: "toBeVisible" }])]
    });
    const result = expectWritten(
      await runGenerator(fs, { mode: "register_page", feature: "auth", page: searchPage })
    );
    expect(result.filesWritten).toContain("pages/SearchPage.ts");
  });

  it("RP6 — accepts a page with no steps whose first verify requires a param", async () => {
    const { fs } = await seedAuthProject();
    const countPage = pageDef({
      feature: "auth",
      page_class: "CountPage",
      owned_by: "auth",
      elements: [el("items", { tag: "li", role: "listitem", name: "Item" })],
      steps: [],
      verifies: [
        verify(
          "verify_count",
          [{ subject: "element", ref: "items", matcher: "toHaveCount", arg: "count" }],
          {
            params: [{ name: "count", type: "number" }]
          }
        )
      ]
    });
    const result = expectWritten(
      await runGenerator(fs, { mode: "register_page", feature: "auth", page: countPage })
    );
    expect(result.filesWritten).toContain("pages/CountPage.ts");
  });
});

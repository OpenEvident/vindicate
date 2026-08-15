import { describe, expect, it } from "vitest";

import { buildPageObject } from "../../../src/codegen/page-object.js";
import { el, pageDef, step, verify } from "./helpers/fixtures.js";

describe("page-object", () => {
  const baseElements = [
    el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
    el("roleBtn", { tag: "button", role: "button", name: "Go" })
  ];

  describe("locator block output", () => {
    it("P1 — N elements produce 2N locator block lines", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: baseElements,
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      const locatorSection = content.split("// ── Steps")[0] ?? "";
      const helperComments = (locatorSection.match(/\/\/ locator-helper:/g) ?? []).length;
      const privateFields = (locatorSection.match(/private \w+ =/g) ?? []).length;
      expect(helperComments).toBe(2);
      expect(privateFields).toBe(2);
      expect(helperComments * 2).toBe(privateFields * 2);
    });

    it("P2 — comment is directly above the private field", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [baseElements[0]!],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      expect(content).toContain("// locator-helper: testid\n  private emailInput =");
    });

    it("P3 — locator block has no blank lines between pairs", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: baseElements,
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      const block = content.split("// ── Locators")[1]?.split("// ── Steps")[0] ?? "";
      expect(block).not.toMatch(/locator-helper:[^\n]*\n\n {2}private/);
    });

    it("P4 — role_name comment for role-based element", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [baseElements[1]!],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "roleBtn", matcher: "toBeVisible" }])
          ]
        })
      );
      expect(content).toContain("// locator-helper: role_name");
    });

    it("P5 — testid comment for testid element", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [baseElements[0]!],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      expect(content).toContain("// locator-helper: testid");
    });

    it("P5b — sibling_text comment includes the matched text and renders an xpath locator", () => {
      const siblingEl = el("eventTypeGay", {
        tag: "input",
        locator: {
          strategy: "sibling_text",
          confidence: "high",
          value: "GAY EVENT",
          xpath:
            '//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]'
        }
      });
      const content = buildPageObject(
        pageDef({
          feature: "event",
          page_class: "AddEventPage",
          elements: [siblingEl],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_ok", [
              { subject: "element", ref: "eventTypeGay", matcher: "toBeVisible" }
            ])
          ]
        })
      );
      expect(content).toContain(
        `// locator-helper: sibling_text (no accessible name — matched via sibling text: "GAY EVENT")`
      );
      expect(content).toContain(
        `= this.page.locator('//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]');`
      );
    });
  });

  describe("step methods", () => {
    const pageWithSteps = pageDef({
      feature: "login",
      page_class: "LoginPage",
      elements: [
        el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
        el("submit", { tag: "button", testid: "submit", testid_attr: "data-testid" }),
        el("agree", { tag: "input", testid: "agree", testid_attr: "data-testid" })
      ],
      steps: [
        step("step_navigate", [{ do: "navigate" }]),
        step("step_fill", [{ do: "fill", ref: "email", value: "a@b.com" }]),
        step("step_click", [{ do: "click", ref: "submit" }]),
        step("step_check", [{ do: "check", ref: "agree" }]),
        step("step_uncheck", [{ do: "uncheck", ref: "agree" }]),
        step("step_wait_response", [{ do: "waitForResponse", urlPattern: "/api/login" }])
      ],
      verifies: [
        verify("verify_ok", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
      ]
    });

    it("P6 — navigate included for page, excluded for panel", () => {
      const pageContent = buildPageObject(pageWithSteps);
      expect(pageContent).toContain("await this.page.goto(this.path);");

      const panelContent = buildPageObject({
        ...pageWithSteps,
        is_panel: true,
        path: undefined
      });
      expect(panelContent).not.toContain("await this.page.goto(this.path);");
    });

    it("P7 — click emits field click call", () => {
      expect(buildPageObject(pageWithSteps)).toContain("await this.submitButton.click();");
    });

    it("P8 — fill emits field fill call", () => {
      expect(buildPageObject(pageWithSteps)).toContain('await this.emailInput.fill("a@b.com");');
    });

    it("P8b — type emits pressSequentially, not fill (React-controlled inputs need real keystrokes)", () => {
      const content = buildPageObject({
        ...pageWithSteps,
        steps: [
          ...pageWithSteps.steps,
          step("step_type", [{ do: "type", ref: "email", value: "a@b.com" }])
        ]
      });
      expect(content).toContain('await this.emailInput.pressSequentially("a@b.com");');
      expect(content).not.toContain(
        'await this.emailInput.fill("a@b.com");await this.emailInput.pressSequentially'
      );
    });

    it("P8c — type with clear_first emits a .clear() call before pressSequentially, both correctly indented", () => {
      const content = buildPageObject({
        ...pageWithSteps,
        steps: [
          step("step_type_clear", [
            { do: "type", ref: "email", value: "a@b.com", clear_first: true }
          ])
        ]
      });
      expect(content).toContain(
        '    await this.emailInput.clear();\n    await this.emailInput.pressSequentially("a@b.com");'
      );
    });

    it("P9 — check and uncheck emit respective calls", () => {
      const content = buildPageObject(pageWithSteps);
      expect(content).toContain("await this.agreeInput.check();");
      expect(content).toContain("await this.agreeInput.uncheck();");
    });

    it("P10 — waitForResponse emits page.waitForResponse", () => {
      expect(buildPageObject(pageWithSteps)).toContain(
        "await this.page.waitForResponse(r => r.url().includes('/api/login'));"
      );
    });

    it("P11 — every step method has JSDoc with @returns", () => {
      const content = buildPageObject(pageWithSteps);
      expect((content.match(/Perform the action/g) ?? []).length).toBe(6);
      expect((content.match(/@returns this for chaining/g) ?? []).length).toBeGreaterThanOrEqual(6);
    });

    it("P12 — step methods return Promise<this>", () => {
      const content = buildPageObject(pageWithSteps);
      expect(content).toContain("async step_navigate(): Promise<this>");
      expect(content).toContain("return this;");
    });

    it("P12b — step @param JSDoc includes param name and type", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [
            {
              name: "step_fill_email",
              jsdoc: "Fill email field",
              params: [{ name: "email", type: "string" }],
              actions: [{ do: "fill", ref: "email", param: "email" }]
            }
          ],
          verifies: []
        })
      );
      expect(content).toContain("@param email - Email (string)");
    });
  });

  describe("verify methods", () => {
    it("P13 — single assertion produces one indented line", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_visible", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      const method = content.split("async verify_visible")[1] ?? "";
      const assertionLines = method.split("\n").filter((l) => l.includes("await expect"));
      expect(assertionLines).toHaveLength(1);
      expect(assertionLines[0]).toMatch(/^\s{4}await expect/);
    });

    it("P14 — waitFor assertion emits waitFor then expect", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_visible", [
              {
                subject: "element",
                ref: "email",
                waitFor: "visible",
                matcher: "toBeVisible"
              }
            ])
          ]
        })
      );
      expect(content).toContain("await this.emailInput.waitFor({ state: 'visible' });");
      expect(content).toContain("await expect(this.emailInput).toBeVisible();");
    });

    it("P15 — multiple assertions expand independently", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_combo", [
              { subject: "page", matcher: "toHaveURL", arg: "'/dashboard'" },
              { subject: "element", ref: "email", matcher: "toBeVisible" }
            ])
          ]
        })
      );
      expect(content).toContain("await expect(this.page).toHaveURL('/dashboard');");
      expect(content).toContain("await expect(this.emailInput).toBeVisible();");
    });

    it("P16 — verify methods have JSDoc and Promise<this>", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_visible", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      expect(content).toContain("* Verify the outcome");
      expect(content).toContain("@returns this for chaining");
      expect(content).toContain("async verify_visible(): Promise<this>");
    });
  });

  describe("class structure", () => {
    it("P17 — page extends BasePage", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      );
      expect(content).toContain("import { BasePage } from './BasePage';");
      expect(content).toContain("extends BasePage");
    });

    it("P18 — panel extends BasePanel", () => {
      const content = buildPageObject(
        pageDef({
          feature: "dash",
          page_class: "NavPanel",
          is_panel: true,
          path: undefined,
          elements: [el("home", { tag: "button", role: "button", name: "Home" })],
          steps: [step("step_open", [{ do: "click", ref: "home" }])],
          verifies: []
        })
      );
      expect(content).toContain("import { BasePanel } from './BasePanel';");
      expect(content).toContain("extends BasePanel");
    });

    it("P19 — readonly path on pages, absent on panels", () => {
      const pageContent = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          path: "/login",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      );
      expect(pageContent).toContain("readonly path = '/login';");

      const panelContent = buildPageObject(
        pageDef({
          feature: "dash",
          page_class: "NavPanel",
          is_panel: true,
          path: undefined,
          elements: [el("home", { tag: "button", role: "button", name: "Home" })],
          steps: [step("step_open", [{ do: "click", ref: "home" }])],
          verifies: []
        })
      );
      expect(panelContent).not.toContain("readonly path");
    });

    it("P20 — AUTO-GENERATED header has no schema reference", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      );
      expect(content.startsWith("// AUTO-GENERATED")).toBe(true);
      expect(content).not.toContain(".vindicate/schemas");
    });

    it("P21 — expect import omitted when no verify methods", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      );
      expect(content).not.toContain("import { expect }");
    });

    it("P22 — expect import included when verify methods exist", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_visible", [{ subject: "element", ref: "email", matcher: "toBeVisible" }])
          ]
        })
      );
      expect(content).toContain("import { expect } from '@playwright/test';");
    });

    it("P23 — fill param emits param identifier instead of literal", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [
            step("step_fillEmail", [{ do: "fill", ref: "email", param: "email" }], {
              params: [{ name: "email", type: "string" }]
            })
          ],
          verifies: []
        })
      );
      expect(content).toContain("async step_fillEmail(email: string): Promise<this>");
      expect(content).toContain("await this.emailInput.fill(email);");
    });

    it("P25 — dynamic element emits a locator method, not a field", () => {
      const content = buildPageObject(
        pageDef({
          feature: "products",
          page_class: "ProductsPage",
          elements: [
            el("deleteBtn", {
              tag: "button",
              testid: "delete-product-{id}",
              testid_attr: "data-testid",
              dynamic: [{ name: "id", type: "string" }]
            })
          ],
          steps: [
            step("step_delete", [{ do: "click", ref: "deleteBtn", refArgs: ["id"] }], {
              params: [{ name: "id", type: "string" }]
            })
          ],
          verifies: []
        })
      );
      expect(content).toContain("// locator-helper: dyn_param");
      expect(content).toContain("private deleteProductButton(id: string): Locator {");
      expect(content).toContain("return this.page.getByTestId(`delete-product-${id}`);");
      expect(content).toContain("import { Locator } from '@playwright/test';");
      expect(content).toContain("await this.deleteProductButton(id).click();");
    });

    it("P26 — dynamic element in a verify threads refArgs into the assertion", () => {
      const content = buildPageObject(
        pageDef({
          feature: "products",
          page_class: "ProductsPage",
          elements: [
            el("rowStatus", {
              tag: "span",
              testid: "row-status-{id}",
              testid_attr: "data-testid",
              dynamic: [{ name: "id", type: "string" }]
            })
          ],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify(
              "verify_row_removed",
              [
                {
                  subject: "element",
                  ref: "rowStatus",
                  refArgs: ["id"],
                  waitFor: "hidden",
                  matcher: "toBeHidden"
                }
              ],
              { params: [{ name: "id", type: "string" }] }
            )
          ]
        })
      );
      expect(content).toContain("await this.rowStatusSpan(id).waitFor({ state: 'hidden' });");
      expect(content).toContain("await expect(this.rowStatusSpan(id)).toBeHidden();");
    });

    it("P27 — click_if_visible emits clickIfVisible helper call", () => {
      const content = buildPageObject(
        pageDef({
          feature: "shop",
          page_class: "ShopPage",
          elements: [
            el("promo", { tag: "button", testid: "promo-close", testid_attr: "data-testid" })
          ],
          steps: [step("step_dismiss", [{ do: "click_if_visible", ref: "promo" }])],
          verifies: []
        })
      );
      expect(content).toContain("await this.clickIfVisible(this.promoCloseButton);");
    });

    it("P28 — click_if_visible with timeout passes the timeout arg", () => {
      const content = buildPageObject(
        pageDef({
          feature: "shop",
          page_class: "ShopPage",
          elements: [
            el("promo", { tag: "button", testid: "promo-close", testid_attr: "data-testid" })
          ],
          steps: [step("step_dismiss", [{ do: "click_if_visible", ref: "promo", timeout: 5000 }])],
          verifies: []
        })
      );
      expect(content).toContain("await this.clickIfVisible(this.promoCloseButton, 5000);");
    });

    it("P29 — no Locator import when there are no dynamic elements", () => {
      const content = buildPageObject(
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      );
      expect(content).not.toMatch(/import \{[^}]*Locator[^}]*\} from '@playwright\/test'/);
    });

    it("P24 — imports expected from page-loader when verify arg references expected.*", () => {
      const content = buildPageObject(
        pageDef({
          feature: "auth",
          page_class: "LoginPage",
          elements: [el("loginError", { tag: "div", testid: "login-error", testid_attr: "e2e" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_login_error_displayed", [
              {
                subject: "element",
                ref: "loginError",
                matcher: "toContainText",
                arg: "expected.invalidLoginMessage"
              }
            ])
          ]
        }),
        { expectedBarrelExport: "authExpected" }
      );
      expect(content).toContain("import { authExpected as expected } from '@config/page-loader';");
      expect(content).toContain("toContainText(expected.invalidLoginMessage)");
    });

    it("emits dragTo helper call for drag actions", () => {
      const content = buildPageObject(
        pageDef({
          feature: "dnd",
          page_class: "DndPage",
          elements: [
            el("source", { tag: "div", testid: "source", testid_attr: "data-testid" }),
            el("target", { tag: "div", testid: "target", testid_attr: "data-testid" })
          ],
          steps: [
            step("step_drag_item", [
              { do: "drag", ref: "source", toRef: "target" },
              { do: "drag", ref: "source", toRef: "target", strategy: "native" }
            ])
          ],
          verifies: []
        })
      );
      expect(content).toContain("await this.dragTo(this.sourceDiv, this.targetDiv);");
      expect(content).toContain(
        "await this.dragTo(this.sourceDiv, this.targetDiv, { native: true });"
      );
    });
  });
});

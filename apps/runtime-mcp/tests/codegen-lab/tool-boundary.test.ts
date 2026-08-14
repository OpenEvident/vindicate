import { describe, expect, it } from "vitest";

import { GenerateCodeInputSchema } from "../../src/codegen/schema.js";
import { zodErrorToCodegenError } from "../../src/codegen/validation.js";

describe("codegen tool boundary validation", () => {
  it("returns actionable fix for unknown action from raw AI payload", () => {
    const parsed = GenerateCodeInputSchema.safeParse({
      mode: "create",
      feature: "login",
      schema: {
        pages: [
          {
            feature: "login",
            page_class: "LoginPage",
            path: "/login",
            owned_by: "login",
            elements: [{ ref: "submit", tag: "button", role: "button", name: "Submit" }],
            types: [],
            steps: [{ name: "step_submit", jsdoc: "Submit", params: [], actions: [{ do: "clck", ref: "submit" }] }],
            verifies: []
          }
        ],
        spec: {
          suite: "App - Login",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [{ ac_id: "AC-1", scenario: "Submit", title: "[AC-1] submit", body: [{ fixture: "loginPage", call: "step_submit" }] }]
        }
      }
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = zodErrorToCodegenError(parsed.error);
    expect(err.field).toContain(".do");
    expect(err.fix).toContain("Valid actions:");
  });

  it("returns actionable fix for unknown matcher from raw AI payload", () => {
    const parsed = GenerateCodeInputSchema.safeParse({
      mode: "create",
      feature: "login",
      schema: {
        pages: [
          {
            feature: "login",
            page_class: "LoginPage",
            path: "/login",
            owned_by: "login",
            elements: [{ ref: "submit", tag: "button", role: "button", name: "Submit" }],
            types: [],
            steps: [{ name: "step_submit", jsdoc: "Submit", params: [], actions: [{ do: "click", ref: "submit" }] }],
            verifies: [{ name: "verify_submit", jsdoc: "Verify", params: [], assertions: [{ subject: "element", ref: "submit", matcher: "toBeVisibl" }] }]
          }
        ],
        spec: {
          suite: "App - Login",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [{ ac_id: "AC-1", scenario: "Submit", title: "[AC-1] submit", body: [{ fixture: "loginPage", call: "step_submit" }] }]
        }
      }
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = zodErrorToCodegenError(parsed.error);
    expect(err.field).toContain(".matcher");
    expect(err.fix).toContain("Valid matchers:");
  });

  it("flags step name prefix violations with concrete field path", () => {
    const parsed = GenerateCodeInputSchema.safeParse({
      mode: "register_page",
      feature: "login",
      page: {
        feature: "login",
        page_class: "LoginPage",
        path: "/login",
        owned_by: "login",
        elements: [{ ref: "submit", tag: "button", role: "button", name: "Submit" }],
        types: [],
        steps: [
          {
            name: "login",
            jsdoc: "Bad prefix",
            params: [],
            actions: [{ do: "navigate" }]
          }
        ],
        verifies: [
          {
            name: "verify_ok",
            jsdoc: "Ok",
            params: [],
            assertions: [{ subject: "element", ref: "submit", matcher: "toBeVisible" }]
          }
        ]
      }
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = zodErrorToCodegenError(parsed.error);
    expect(err.field).toBe("page.steps.0.name");
    expect(err.validationMessage).toContain("Step names must start with 'step_'");
  });
});

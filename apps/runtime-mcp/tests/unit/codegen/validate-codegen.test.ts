import { describe, expect, it } from "vitest";

import {
  collectCrossReferenceErrors,
  validateFullSchema,
  zodIssuesToValidationErrors
} from "../../../src/codegen/validate-codegen.js";
import { GenerateCodeInputSchema } from "../../../src/codegen/schema.js";
import type { Action } from "../../../src/codegen/schema.js";
import { el, fullSchema, pageDef, step, testCase, verify } from "./helpers/fixtures.js";

describe("validate-codegen", () => {
  it("collects multiple owned_by and cross-ref errors", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "LoginPage",
          owned_by: "loginPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        }),
        pageDef({
          feature: "auth",
          page_class: "HomePage",
          path: "/",
          owned_by: "homePage",
          elements: [el("dash", { tag: "a", role: "link", name: "Home" })],
          steps: [],
          verifies: [
            verify("verify_home", [{ subject: "element", ref: "dash", matcher: "toBeVisible" }])
          ]
        })
      ],
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          testCase("AC-1", {
            body: [
              { fixture: "loginPage", call: "step_navigate" },
              { fixture: "homePage", call: "verify_home" }
            ]
          })
        ]
      }
    });

    const errors = validateFullSchema(schema, "auth");
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.some((e) => e.code === "owned_by_mismatch")).toBe(true);
  });

  // Regression coverage for a real, confirmed mistake: a hand-authored 'text' locator copied the
  // 'scoped' strategy's `container` field, believing it would scope the getByText search to that
  // container. `container` is only ever consulted for the 'scoped' strategy — for every other
  // strategy it's silently ignored, so the resulting locator searches the whole page instead.
  it("flags a 'container' field on a non-scoped locator strategy", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "cart",
          page_class: "CartPage",
          owned_by: "cart",
          elements: [
            el("subtotalLabel", {
              tag: "div",
              locator: {
                strategy: "text",
                confidence: "high",
                value: "Subtotal",
                container: { role: "dialog", name: "Your Cart" }
              }
            })
          ],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      ],
      spec: {
        suite: "Cart",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [testCase("AC-1", { body: [{ fixture: "cartPage", call: "step_navigate" }] })]
      }
    });

    const errors = validateFullSchema(schema, "cart");
    const flagged = errors.find((e) => e.code === "container_ignored_for_strategy");
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("subtotalLabel");
    expect(flagged?.message).toContain("text");
  });

  it("does not flag 'container' on an actual 'scoped' locator (the valid use)", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "cart",
          page_class: "CartPage",
          owned_by: "cart",
          elements: [
            el("deleteRowButton", {
              tag: "button",
              locator: {
                strategy: "scoped",
                confidence: "high",
                role: "button",
                name: "Delete",
                container: { role: "row", name: "Jane Doe" }
              }
            })
          ],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      ],
      spec: {
        suite: "Cart",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [testCase("AC-1", { body: [{ fixture: "cartPage", call: "step_navigate" }] })]
      }
    });

    const errors = validateFullSchema(schema, "cart");
    expect(errors.some((e) => e.code === "container_ignored_for_strategy")).toBe(false);
  });

  it("detects unknown fixture in spec body", () => {
    const schema = fullSchema({
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          testCase("AC-1", {
            body: [{ fixture: "ghostPage", call: "step_navigate" }]
          })
        ]
      }
    });
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.some((e) => e.code === "unknown_fixture")).toBe(true);
  });

  it("detects invalid BodyCall arg expressions", () => {
    const schema = fullSchema({
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          testCase("AC-1", {
            body: [{ fixture: "loginPage", call: "step_submit", args: ["/\\/($|\\?)"] }]
          })
        ]
      }
    });
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.some((e) => e.code === "invalid_body_call_arg")).toBe(true);
  });

  it("flags a title missing the [AC-n] prefix matching its own ac_id", () => {
    const schema = fullSchema({
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [testCase("AC-1", { title: "should log in" })]
      }
    });
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.some((e) => e.code === "missing_ac_prefix")).toBe(true);
  });

  it("does not flag a title with the correct [AC-n] prefix", () => {
    const schema = fullSchema();
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.some((e) => e.code === "missing_ac_prefix")).toBe(false);
  });

  it("detects quoted process.env in BodyCall args", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [
            el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
            el("password", { tag: "input", testid: "password", testid_attr: "data-testid" })
          ],
          steps: [
            step("step_navigate", [{ do: "navigate" }]),
            step(
              "step_login_with_credentials",
              [
                { do: "fill", ref: "email", param: "email" },
                { do: "fill", ref: "password", param: "password" }
              ],
              {
                params: [
                  { name: "email", type: "string" },
                  { name: "password", type: "string" }
                ]
              }
            )
          ],
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
            body: [
              {
                fixture: "loginPage",
                call: "step_login_with_credentials",
                args: ["'process.env.TEST_USER_EMAIL!'", "'process.env.TEST_USER_PASSWORD!'"]
              }
            ]
          })
        ]
      }
    });
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.filter((e) => e.code === "quoted_env_var_arg")).toHaveLength(2);
  });

  it("detects credentials baked into step fill value", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [
            el("emailInput", { tag: "input", testid: "email", testid_attr: "data-testid" }),
            el("passwordInput", { tag: "input", testid: "password", testid_attr: "data-testid" })
          ],
          steps: [
            step(
              "step_login_with_credentials",
              [
                { do: "fill", ref: "emailInput", value: "user@example.com" },
                { do: "fill", ref: "passwordInput", param: "password" }
              ],
              {
                params: [{ name: "password", type: "string" }]
              }
            )
          ],
          verifies: []
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "secret_in_step_value")).toBe(true);
  });

  it("detects credentials baked into step type value (type gets the same checks as fill)", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [
            el("emailInput", { tag: "input", testid: "email", testid_attr: "data-testid" }),
            el("passwordInput", { tag: "input", testid: "password", testid_attr: "data-testid" })
          ],
          steps: [
            step(
              "step_login_with_credentials",
              [
                { do: "type", ref: "emailInput", value: "user@example.com" },
                { do: "type", ref: "passwordInput", param: "password" }
              ],
              {
                params: [{ name: "password", type: "string" }]
              }
            )
          ],
          verifies: []
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "secret_in_step_value")).toBe(true);
  });

  it("rejects a type action with neither value nor param", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [
            el("emailInput", { tag: "input", testid: "email", testid_attr: "data-testid" })
          ],
          steps: [step("step_type_email", [{ do: "type", ref: "emailInput" }])],
          verifies: []
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "fill_value_param_exclusive")).toBe(true);
  });

  it("allows bare process.env in BodyCall args", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [
            el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
            el("password", { tag: "input", testid: "password", testid_attr: "data-testid" })
          ],
          steps: [
            step(
              "step_login_with_credentials",
              [
                { do: "fill", ref: "email", param: "email" },
                { do: "fill", ref: "password", param: "password" }
              ],
              {
                params: [
                  { name: "email", type: "string" },
                  { name: "password", type: "string" }
                ]
              }
            )
          ],
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
            body: [
              {
                fixture: "loginPage",
                call: "step_login_with_credentials",
                args: ["process.env.TEST_USER_EMAIL!", "process.env.TEST_USER_PASSWORD!"]
              }
            ]
          })
        ]
      }
    });
    const errors = collectCrossReferenceErrors(schema);
    expect(errors.some((e) => e.code === "quoted_env_var_arg")).toBe(false);
  });

  it("detects duplicate element refs in a page", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [
            el("email", { tag: "input", testid: "email", testid_attr: "data-testid" }),
            el("email", { tag: "input", testid: "email-2", testid_attr: "data-testid" })
          ],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "duplicate_element_ref")).toBe(true);
  });

  it("detects expected.* in verify arg without expected block", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("err", { tag: "div", role: "alert", name: "Error" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_error", [
              {
                subject: "element",
                ref: "err",
                matcher: "toContainText",
                arg: "expected.invalidLoginMessage"
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "expected_block_missing")).toBe(true);
  });

  it("detects unknown expected key in verify arg", () => {
    const schema = fullSchema({
      expected: { otherMessage: "x" },
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          elements: [el("err", { tag: "div", role: "alert", name: "Error" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_error", [
              {
                subject: "element",
                ref: "err",
                matcher: "toContainText",
                arg: "expected.invalidLoginMessage"
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "unknown_expected_key")).toBe(true);
  });

  it("rejects inline test-data literals in BodyCall.args without expected block", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          owned_by: "auth",
          elements: [
            el("emailInput", { tag: "input", testid: "email", testid_attr: "e2e" }),
            el("passwordInput", { tag: "input", testid: "password", testid_attr: "e2e" }),
            el("loginButton", { tag: "button", testid: "login", testid_attr: "e2e" })
          ],
          steps: [
            step("step_submit_credentials", [
              { do: "fill", ref: "emailInput", param: "email" },
              { do: "fill", ref: "passwordInput", param: "password" },
              { do: "click", ref: "loginButton" }
            ])
          ],
          verifies: []
        })
      ],
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          {
            ac_id: "AC-2",
            scenario: "Invalid",
            title: "[AC-2] invalid",
            body: [
              {
                fixture: "authPage",
                call: "step_submit_credentials",
                args: ["'invalid@example.com'", "'WrongPass123!'"]
              }
            ]
          }
        ]
      }
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "use_expected_for_test_data")).toBe(true);
  });

  it("rejects inline regex assertion arg without expected block", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          elements: [el("authError", { tag: "generic", role: "alert", name: "auth error" })],
          steps: [step("step_open_login", [{ do: "navigate" }])],
          verifies: [
            verify("verify_auth_error_visible", [
              {
                subject: "element",
                ref: "authError",
                matcher: "toContainText",
                arg: "/invalid|incorrect|error/i"
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "use_expected_for_test_data")).toBe(true);
  });

  // Regression coverage for the ReDoS fix in REGEX_LITERAL: [^/] was widened to [^\\/] so it can
  // no longer overlap with the \\. branch of the alternation. Same behavior, no ambiguity.
  it("still detects an inline regex arg containing escaped slashes and backslashes", () => {
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          elements: [el("authError", { tag: "generic", role: "alert", name: "auth error" })],
          steps: [step("step_open_login", [{ do: "navigate" }])],
          verifies: [
            verify("verify_auth_error_visible", [
              {
                subject: "element",
                ref: "authError",
                matcher: "toContainText",
                arg: "/back\\\\slash\\/path/i"
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "use_expected_for_test_data")).toBe(true);
  });

  it("validates quickly for a long run of backslashes that used to risk catastrophic backtracking", () => {
    const pathological = "/" + "\\".repeat(2000) + "/Z";
    const schema = fullSchema({
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          elements: [el("authError", { tag: "generic", role: "alert", name: "auth error" })],
          steps: [step("step_open_login", [{ do: "navigate" }])],
          verifies: [
            verify("verify_auth_error_visible", [
              { subject: "element", ref: "authError", matcher: "toContainText", arg: pathological }
            ])
          ]
        })
      ]
    });
    const start = Date.now();
    validateFullSchema(schema, "auth");
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("allows expected.* references when expected block is present", () => {
    const schema = fullSchema({
      expected: {
        invalidEmail: "invalid@example.com",
        invalidPassword: "WrongPass123!",
        authErrorPattern: "/invalid|error/i"
      },
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          owned_by: "auth",
          elements: [
            el("emailInput", { tag: "input", testid: "email", testid_attr: "e2e" }),
            el("passwordInput", { tag: "input", testid: "password", testid_attr: "e2e" }),
            el("loginButton", { tag: "button", testid: "login", testid_attr: "e2e" }),
            el("authError", { tag: "generic", role: "alert", name: "auth error" })
          ],
          steps: [
            step("step_submit_credentials", [
              { do: "fill", ref: "emailInput", param: "email" },
              { do: "fill", ref: "passwordInput", param: "password" },
              { do: "click", ref: "loginButton" }
            ])
          ],
          verifies: [
            verify("verify_auth_error_visible", [
              {
                subject: "element",
                ref: "authError",
                matcher: "toContainText",
                arg: "expected.authErrorPattern"
              }
            ])
          ]
        })
      ],
      spec: {
        suite: "Auth",
        generates_storage_state: null,
        storage_state: null,
        before_each: null,
        cases: [
          {
            ac_id: "AC-1",
            scenario: "Happy",
            title: "[AC-1] happy",
            body: [
              {
                fixture: "authPage",
                call: "step_submit_credentials",
                args: ["process.env.AUTH_EMAIL!", "process.env.AUTH_PASSWORD!"]
              }
            ]
          },
          {
            ac_id: "AC-2",
            scenario: "Invalid",
            title: "[AC-2] invalid",
            body: [
              {
                fixture: "authPage",
                call: "step_submit_credentials",
                args: ["expected.invalidEmail", "expected.invalidPassword"]
              }
            ]
          }
        ]
      }
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "use_expected_for_test_data")).toBe(false);
  });

  it("allows unrelated inline literals when expected block has other keys", () => {
    const schema = fullSchema({
      expected: {
        loginEmail: "qa@example.com",
        loginPassword: "pw12345"
      },
      pages: [
        pageDef({
          feature: "login",
          page_class: "LoginPage",
          owned_by: "login",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: [
            verify("verify_loginVisible", [
              { subject: "page", matcher: "toHaveTitle", arg: "'Login'" }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "login");
    expect(errors.some((e) => e.code === "inline_test_data_with_expected_block")).toBe(false);
  });

  it("rejects duplicate inline assertion arg when expected block has matching value", () => {
    const schema = fullSchema({
      expected: {
        invalidCredentialsMessage: "Invalid credentials"
      },
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          owned_by: "auth",
          elements: [el("errorMessage", { tag: "div", role: "alert" })],
          steps: [step("step_open_login", [{ do: "navigate" }])],
          verifies: [
            verify("verify_errorMessage", [
              {
                subject: "element",
                ref: "errorMessage",
                matcher: "toContainText",
                arg: "'Invalid credentials'"
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "auth");
    const hit = errors.find((e) => e.code === "inline_test_data_with_expected_block");
    expect(hit).toBeDefined();
    expect(hit?.fix).toContain("expected.invalidCredentialsMessage");
  });

  it("rejects duplicate inline assertion arg for double-quoted TS strings", () => {
    const schema = fullSchema({
      expected: {
        invalidCredentialsMessage: "Invalid credentials"
      },
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          owned_by: "auth",
          elements: [el("errorMessage", { tag: "div", role: "alert" })],
          steps: [step("step_open_login", [{ do: "navigate" }])],
          verifies: [
            verify("verify_errorMessage", [
              {
                subject: "element",
                ref: "errorMessage",
                matcher: "toContainText",
                arg: '"Invalid credentials"'
              }
            ])
          ]
        })
      ]
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "inline_test_data_with_expected_block")).toBe(true);
  });

  it("rejects empty expected block and inline literals without keys", () => {
    const schema = fullSchema({
      expected: {},
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_fill", [{ do: "fill", ref: "email", param: "email" }])],
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
            body: [{ fixture: "authPage", call: "step_fill", args: ["'user@example.com'"] }]
          })
        ]
      }
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "empty_expected_block")).toBe(true);
    expect(errors.some((e) => e.code === "use_expected_for_test_data")).toBe(true);
  });

  it("rejects duplicate string values across expected keys", () => {
    const schema = fullSchema({
      expected: {
        errorA: "same text",
        errorB: "same text"
      },
      pages: [
        pageDef({
          feature: "auth",
          page_class: "AuthPage",
          elements: [el("email", { tag: "input", testid: "email", testid_attr: "data-testid" })],
          steps: [step("step_navigate", [{ do: "navigate" }])],
          verifies: []
        })
      ]
    });
    const errors = validateFullSchema(schema, "auth");
    expect(errors.some((e) => e.code === "duplicate_expected_value")).toBe(true);
  });

  it("maps all zod issues", () => {
    const parsed = GenerateCodeInputSchema.safeParse({ mode: "create", feature: "login" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = zodIssuesToValidationErrors(parsed.error);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.every((e) => e.code === "schema_shape")).toBe(true);
      expect(errors.some((e) => e.path.includes("schema"))).toBe(true);
    }
  });

  describe("dynamic locators + conditional", () => {
    function productsSchema(opts: { del: ReturnType<typeof el>; action: Action }) {
      return fullSchema({
        expected: { pid: "p-1" },
        pages: [
          pageDef({
            feature: "products",
            page_class: "ProductsPage",
            owned_by: "products",
            elements: [opts.del],
            steps: [
              step("step_delete", [opts.action], { params: [{ name: "id", type: "string" }] })
            ],
            verifies: []
          })
        ],
        spec: {
          suite: "Products",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [
            testCase("AC-1", {
              body: [{ fixture: "productsPage", call: "step_delete", args: ["expected.pid"] }]
            })
          ]
        }
      });
    }

    it("accepts a well-formed dynamic locator + refArgs", () => {
      const schema = productsSchema({
        del: el("del", {
          tag: "button",
          testid: "delete-{id}",
          testid_attr: "data-testid",
          dynamic: [{ name: "id", type: "string" }]
        }),
        action: { do: "click", ref: "del", refArgs: ["id"] }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_placeholder_mismatch")).toBe(false);
      expect(errors.some((e) => e.code === "dynamic_ref_args")).toBe(false);
    });

    it("flags a dynamic param with no matching placeholder", () => {
      const schema = productsSchema({
        del: el("del", {
          tag: "button",
          testid: "delete",
          testid_attr: "data-testid",
          dynamic: [{ name: "id", type: "string" }]
        }),
        action: { do: "click", ref: "del", refArgs: ["id"] }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_placeholder_mismatch")).toBe(true);
    });

    it("flags a placeholder with no declared dynamic param", () => {
      const schema = productsSchema({
        del: el("del", { tag: "button", testid: "delete-{id}", testid_attr: "data-testid" }),
        action: { do: "click", ref: "del" }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_placeholder_mismatch")).toBe(true);
    });

    it("flags a dynamic ref missing refArgs", () => {
      const schema = productsSchema({
        del: el("del", {
          tag: "button",
          testid: "delete-{id}",
          testid_attr: "data-testid",
          dynamic: [{ name: "id", type: "string" }]
        }),
        action: { do: "click", ref: "del" }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_ref_args")).toBe(true);
    });

    it("flags refArgs passed to a non-dynamic element", () => {
      const schema = productsSchema({
        del: el("del", { tag: "button", testid: "delete", testid_attr: "data-testid" }),
        action: { do: "click", ref: "del", refArgs: ["id"] }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_ref_args")).toBe(true);
    });

    it("accepts a well-formed dynamic sibling_text locator (placeholder lives in xpath, not value)", () => {
      const schema = productsSchema({
        del: el("del", {
          tag: "button",
          dynamic: [{ name: "id", type: "string" }],
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "Delete",
            xpath: '//button[preceding-sibling::*[normalize-space()="Delete {id}"]]'
          }
        }),
        action: { do: "click", ref: "del", refArgs: ["id"] }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_placeholder_mismatch")).toBe(false);
    });

    it("flags a sibling_text locator's xpath placeholder with no declared dynamic param", () => {
      const schema = productsSchema({
        del: el("del", {
          tag: "button",
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "Delete",
            xpath: '//button[preceding-sibling::*[normalize-space()="Delete {id}"]]'
          }
        }),
        action: { do: "click", ref: "del" }
      });
      const errors = validateFullSchema(schema, "products");
      expect(errors.some((e) => e.code === "dynamic_placeholder_mismatch")).toBe(true);
    });
  });

  describe("waitForResponse provenance", () => {
    function authSchemaWithWait(urlPattern: string, observedEndpoints?: string[]) {
      return fullSchema({
        ...(observedEndpoints !== undefined ? { observed_endpoints: observedEndpoints } : {}),
        pages: [
          pageDef({
            feature: "auth",
            page_class: "AuthPage",
            owned_by: "auth",
            path: "/auth/login",
            elements: [el("loginButton", { tag: "button", role: "button", name: "Sign in" })],
            steps: [
              step("step_submit", [
                { do: "click", ref: "loginButton" },
                { do: "waitForResponse", urlPattern }
              ])
            ],
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
              body: [{ fixture: "authPage", call: "step_submit" }]
            })
          ]
        }
      });
    }

    it("requires observed_endpoints when waitForResponse is used", () => {
      const errors = validateFullSchema(authSchemaWithWait("/web/index.php/auth/validate"));
      expect(errors.some((e) => e.code === "waitforresponse_missing_observed")).toBe(true);
    });

    it("rejects documentation placeholder urlPattern without ground proof", () => {
      const errors = validateFullSchema(
        authSchemaWithWait("/auth/validate", ["/web/index.php/dashboard"])
      );
      expect(errors.some((e) => e.code === "waitforresponse_doc_placeholder")).toBe(true);
    });

    it("rejects urlPattern not in observed_endpoints", () => {
      const errors = validateFullSchema(
        authSchemaWithWait("/api/custom/login", ["/web/index.php/auth/validate"])
      );
      expect(errors.some((e) => e.code === "waitforresponse_unobserved_endpoint")).toBe(true);
    });

    it("accepts urlPattern that matches observed_endpoints", () => {
      const errors = validateFullSchema(
        authSchemaWithWait("/auth/validate", ["/web/index.php/auth/validate"])
      );
      expect(errors.some((e) => e.code.startsWith("waitforresponse_"))).toBe(false);
    });
  });

  describe("URL pattern validation", () => {
    function dashboardSchema(
      verifies: ReturnType<typeof verify>[],
      steps: ReturnType<typeof step>[] = [step("step_navigate", [{ do: "navigate" }])]
    ) {
      return fullSchema({
        pages: [
          pageDef({
            feature: "auth",
            page_class: "DashboardPage",
            owned_by: "auth",
            path: "/dashboard",
            elements: [],
            steps,
            verifies
          })
        ],
        spec: {
          suite: "Auth",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [
            testCase("AC-1", {
              body: [{ fixture: "dashboardPage", call: verifies[0]!.name }]
            })
          ]
        }
      });
    }

    it("rejects malformed toHaveURL glob in assertion arg", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "'**/dashboard/index**'" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "malformed_url_glob")).toBe(true);
    });

    it("rejects malformed waitForURL step pattern", () => {
      const schema = fullSchema({
        pages: [
          pageDef({
            feature: "auth",
            page_class: "LoginPage",
            owned_by: "auth",
            elements: [el("submit", { tag: "button", role: "button", name: "Login" })],
            steps: [
              step("step_submit", [
                { do: "click", ref: "submit" },
                { do: "waitForURL", pattern: "**/auth/login**" }
              ])
            ],
            verifies: []
          })
        ],
        spec: {
          suite: "Auth",
          generates_storage_state: null,
          storage_state: null,
          before_each: null,
          cases: [testCase("AC-1", { body: [{ fixture: "loginPage", call: "step_submit" }] })]
        }
      });
      const errors = validateFullSchema(schema, "auth");
      expect(errors.some((e) => e.code === "malformed_url_glob")).toBe(true);
    });

    it("accepts exact path and regex toHaveURL args", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "'/web/index.php/dashboard/index'" },
            { subject: "page", matcher: "toHaveURL", arg: "/dashboard\\/index/" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "malformed_url_glob")).toBe(false);
    });

    // Regression coverage for a real, confirmed bug — reproduced live against a real scaffolded
    // project (baseURL configured, the Vindicate default): `toHaveURL('**/checkout/')` does not do what
    // its glob syntax implies. Playwright prefixes any non-http(s) string arg with `baseURL` before
    // matching, turning `'**/checkout/'` into the literal `'https://example.com/**/checkout/'`, which
    // then fails to match the real URL. A regex arg is never baseURL-resolved and is unaffected.
    it("flags a wildcard toHaveURL string arg as unsafe with a configured baseURL", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "'**/checkout/'" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "baseurl_unsafe_url_glob")).toBe(true);
    });

    it("does not flag a plain relative toHaveURL path with no wildcard (the correct, confirmed-working use of baseURL)", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "'/checkout/'" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "baseurl_unsafe_url_glob")).toBe(false);
    });

    it("does not flag a regex toHaveURL arg (confirmed unaffected by baseURL)", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "/\\/checkout\\/?$/" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "baseurl_unsafe_url_glob")).toBe(false);
    });

    it("does not flag an absolute http(s) toHaveURL string (never baseURL-prefixed)", () => {
      const errors = validateFullSchema(
        dashboardSchema([
          verify("verify_dashboard", [
            { subject: "page", matcher: "toHaveURL", arg: "'https://example.com/**/checkout/'" }
          ])
        ]),
        "auth"
      );
      expect(errors.some((e) => e.code === "baseurl_unsafe_url_glob")).toBe(false);
    });
  });
});

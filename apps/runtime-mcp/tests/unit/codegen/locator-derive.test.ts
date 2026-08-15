import { describe, expect, it } from "vitest";

import {
  deduplicateFieldNames,
  deriveFieldName,
  deriveLocator,
  deriveLocatorHelperComment,
  deriveLocatorStrategy
} from "../../../src/codegen/locator-derive.js";
import { CodegenLocatorError } from "../../../src/shared/errors.js";
import { el } from "./helpers/fixtures.js";

describe("locator-derive", () => {
  describe("deriveLocator", () => {
    it("L1 — testid + testid_attr emits getByTestId", () => {
      const locator = deriveLocator(
        el("e1", { tag: "input", testid: "email", testid_attr: "data-testid" })
      );
      expect(locator).toBe(`this.page.getByTestId('email')`);
    });

    it("L2 — role + name emits getByRole with exact name option", () => {
      const locator = deriveLocator(el("e1", { tag: "button", role: "button", name: "Submit" }));
      expect(locator).toBe(`this.page.getByRole('button', { name: 'Submit', exact: true })`);
    });

    it("L3 — role only emits getByRole without name", () => {
      const locator = deriveLocator(el("e1", { tag: "button", role: "button" }));
      expect(locator).toBe(`this.page.getByRole('button')`);
    });

    it("L4 — name only emits getByText with exact option", () => {
      const locator = deriveLocator(el("e1", { tag: "span", name: "Price" }));
      expect(locator).toBe(`this.page.getByText('Price', { exact: true })`);
    });

    it("L5 — missing testid, role, and name throws CodegenLocatorError naming ref", () => {
      expect(() => deriveLocator(el("ref-missing", { tag: "div" }))).toThrow(CodegenLocatorError);
      try {
        deriveLocator(el("ref-missing", { tag: "div" }));
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CodegenLocatorError);
        expect((err as CodegenLocatorError).message).toContain("ref-missing");
        expect((err as CodegenLocatorError).message).toContain("testid");
      }
    });

    // Regression coverage for a real, confirmed bug: a hand-authored 'text' locator that used `name`
    // (the role_name/scoped tier's field) instead of `value` silently rendered
    // `getByText('', { exact: true })` — a broken, empty-string locator with no validation error at
    // all. testid/label/placeholder had the identical silent-empty-string gap; only the XPath tiers
    // (dom_id/testid_xpath/attr_combo/etc.) already threw on a missing required field.
    it("a 'text' locator with no value throws CodegenLocatorError instead of emitting getByText('')", () => {
      const locator = el("ref-text", {
        tag: "div",
        locator: { strategy: "text", confidence: "high" }
      });
      expect(() => deriveLocator(locator)).toThrow(CodegenLocatorError);
      try {
        deriveLocator(locator);
      } catch (err: unknown) {
        expect((err as CodegenLocatorError).message).toContain("ref-text");
        expect((err as CodegenLocatorError).message).toContain("text");
        expect((err as CodegenLocatorError).message).toContain("no value");
      }
    });

    it("a 'testid' locator with no value throws CodegenLocatorError instead of emitting getByTestId('')", () => {
      const locator = el("ref-testid", {
        tag: "button",
        locator: { strategy: "testid", confidence: "high" }
      });
      expect(() => deriveLocator(locator)).toThrow(CodegenLocatorError);
    });

    it("a 'label' locator with no value throws CodegenLocatorError instead of emitting getByLabel('')", () => {
      const locator = el("ref-label", {
        tag: "input",
        locator: { strategy: "label", confidence: "high" }
      });
      expect(() => deriveLocator(locator)).toThrow(CodegenLocatorError);
    });

    it("a 'placeholder' locator with no value throws CodegenLocatorError instead of emitting getByPlaceholder('')", () => {
      const locator = el("ref-placeholder", {
        tag: "input",
        locator: { strategy: "placeholder", confidence: "high" }
      });
      expect(() => deriveLocator(locator)).toThrow(CodegenLocatorError);
    });

    it("a 'text' locator with a real value still renders correctly (no false-positive regression)", () => {
      const locator = deriveLocator(
        el("ref-text-ok", {
          tag: "div",
          locator: { strategy: "text", confidence: "high", value: "Subtotal" }
        })
      );
      expect(locator).toBe(`this.page.getByText('Subtotal', { exact: true })`);
    });

    it("frame_path — a role_name locator scoped inside one iframe renders a frameLocator chain", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "textbox",
            name: "Email address",
            frame_path: [
              {
                strategy: "dom_id",
                confidence: "high",
                value: "klarna-checkout-iframe",
                xpath: '//*[@id="klarna-checkout-iframe"]'
              }
            ]
          }
        })
      );
      expect(locator).toBe(
        `this.page.frameLocator('xpath=//*[@id="klarna-checkout-iframe"]').getByRole('textbox', { name: 'Email address', exact: true })`
      );
    });

    it("frame_path — chains multiple hops in order for a doubly-nested iframe", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "button",
          locator: {
            strategy: "role_name",
            confidence: "high",
            role: "button",
            name: "Pay with Klarna",
            frame_path: [
              {
                strategy: "dom_id",
                confidence: "high",
                value: "klarna-checkout-iframe",
                xpath: '//*[@id="klarna-checkout-iframe"]'
              },
              { strategy: "nth", confidence: "low", xpath: "/html/body/iframe[1]" }
            ]
          }
        })
      );
      expect(locator).toBe(
        `this.page.frameLocator('xpath=//*[@id="klarna-checkout-iframe"]').frameLocator('xpath=/html/body/iframe[1]').getByRole('button', { name: 'Pay with Klarna', exact: true })`
      );
    });

    it("frame_path — a testid hop renders as an XPath attribute selector (frameLocator has no getByTestId-string form)", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "dom_id",
            confidence: "high",
            value: "target",
            xpath: '//*[@id="target"]',
            frame_path: [
              {
                strategy: "testid",
                confidence: "high",
                attr: "data-testid",
                value: "payment-frame"
              }
            ]
          }
        })
      );
      expect(locator).toBe(
        `this.page.frameLocator('xpath=//*[@data-testid="payment-frame"]').locator('//*[@id="target"]')`
      );
    });

    it("frame_path — an xpath tier (e.g. dom_id) also renders scoped inside a frame", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "dom_id",
            confidence: "high",
            value: "billing-email",
            xpath: '//*[@id="billing-email"]',
            frame_path: [
              {
                strategy: "dom_id",
                confidence: "high",
                value: "klarna-checkout-iframe",
                xpath: '//*[@id="klarna-checkout-iframe"]'
              }
            ]
          }
        })
      );
      expect(locator).toBe(
        `this.page.frameLocator('xpath=//*[@id="klarna-checkout-iframe"]').locator('//*[@id="billing-email"]')`
      );
    });

    it("L6 — testid without testid_attr falls through to role logic", () => {
      const locator = deriveLocator(el("e1", { tag: "button", testid: "only-id", role: "button" }));
      expect(locator).toBe(`this.page.getByRole('button')`);
      expect(locator).not.toContain("getByTestId");
    });

    it("L7 — locators never use CSS attribute selector syntax", () => {
      const locator = deriveLocator(
        el("e1", { tag: "input", testid: "email", testid_attr: "data-testid" })
      );
      expect(locator).not.toMatch(/locator\('\[[^\]]+="/);
    });

    it("L8b — name-prohibited role (alert) drops the content name and renders role-only", () => {
      const locator = deriveLocator(
        el("e1", { tag: "div", role: "alert", name: "Invalid credentials" })
      );
      expect(locator).toBe(`this.page.getByRole('alert')`);
      expect(locator).not.toContain("name:");
    });

    it("L8c — status role with a content name also renders role-only", () => {
      const locator = deriveLocator(el("e1", { tag: "div", role: "status", name: "Saved" }));
      expect(locator).toBe(`this.page.getByRole('status')`);
    });

    it("L8d — a normal name-from-content role (button) keeps its name", () => {
      const locator = deriveLocator(el("e1", { tag: "button", role: "button", name: "Save" }));
      expect(locator).toBe(`this.page.getByRole('button', { name: 'Save', exact: true })`);
    });

    it("L8 — a supplied structured locator is rendered as-is over legacy fields", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "button",
          testid: "ignored",
          testid_attr: "data-testid",
          locator: {
            strategy: "dom_id",
            confidence: "high",
            value: "save",
            xpath: '//*[@id="save"]'
          }
        })
      );
      expect(locator).toBe(`this.page.locator('//*[@id="save"]')`);
    });

    it("L9 — sibling_text locator renders its verified xpath via page.locator", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "GAY EVENT",
            xpath:
              '//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]'
          }
        })
      );
      expect(locator).toBe(
        `this.page.locator('//input[preceding-sibling::*[normalize-space()="GAY EVENT"] or following-sibling::*[normalize-space()="GAY EVENT"]]')`
      );
    });
  });

  describe("deriveLocatorStrategy", () => {
    it("S1 — testid + testid_attr resolves to testid", () => {
      expect(
        deriveLocatorStrategy(el("e1", { tag: "input", testid: "x", testid_attr: "data-testid" }))
      ).toBe("testid");
    });

    it("S2 — role only resolves to role_name", () => {
      expect(deriveLocatorStrategy(el("e1", { tag: "button", role: "button" }))).toBe("role_name");
    });

    it("S3 — role + name resolves to role_name", () => {
      expect(deriveLocatorStrategy(el("e1", { tag: "button", role: "button", name: "Go" }))).toBe(
        "role_name"
      );
    });

    it("S4 — name only resolves to text", () => {
      expect(deriveLocatorStrategy(el("e1", { tag: "span", name: "Label" }))).toBe("text");
    });

    it("S5 — strategy code is one of the valid codes", () => {
      const valid = new Set([
        "testid",
        "testid_xpath",
        "dom_id",
        "role_name",
        "label",
        "placeholder",
        "text",
        "attr_combo",
        "scoped",
        "sibling_text",
        "nth",
        "dyn_param"
      ]);
      const samples = [
        el("a", { tag: "input", testid: "a", testid_attr: "data-testid" }),
        el("b", { tag: "button", role: "button" }),
        el("c", { tag: "span", name: "x" })
      ];
      for (const sample of samples) {
        expect(valid.has(deriveLocatorStrategy(sample))).toBe(true);
      }
    });

    it("S6 — dynamic element resolves to dyn_param", () => {
      expect(
        deriveLocatorStrategy(
          el("e1", {
            tag: "button",
            testid: "delete-{id}",
            testid_attr: "data-testid",
            dynamic: [{ name: "id", type: "string" }]
          })
        )
      ).toBe("dyn_param");
    });

    it("S7 — a supplied sibling_text locator resolves to sibling_text", () => {
      expect(
        deriveLocatorStrategy(
          el("e1", {
            tag: "input",
            locator: {
              strategy: "sibling_text",
              confidence: "high",
              value: "GAY EVENT",
              xpath: '//input[preceding-sibling::*[normalize-space()="GAY EVENT"]]'
            }
          })
        )
      ).toBe("sibling_text");
    });
  });

  describe("deriveLocatorHelperComment", () => {
    it("H1 — sibling_text includes the matched sibling text in the comment", () => {
      const comment = deriveLocatorHelperComment(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "GAY EVENT",
            xpath: '//input[preceding-sibling::*[normalize-space()="GAY EVENT"]]'
          }
        })
      );
      expect(comment).toBe(
        `sibling_text (no accessible name — matched via sibling text: "GAY EVENT")`
      );
    });

    it("H2 — every other strategy renders as the plain strategy code (no parenthetical)", () => {
      expect(
        deriveLocatorHelperComment(el("e1", { tag: "button", role: "button", name: "Save" }))
      ).toBe("role_name");
      expect(
        deriveLocatorHelperComment(
          el("e1", { tag: "input", testid: "email", testid_attr: "data-testid" })
        )
      ).toBe("testid");
    });

    it("H2b — click_delegate locator appends the click-only parenthetical regardless of strategy", () => {
      const comment = deriveLocatorHelperComment(
        el("e1", {
          tag: "div",
          locator: {
            strategy: "text",
            confidence: "high",
            value: "GAY EVENT",
            click_delegate: true
          }
        })
      );
      expect(comment).toBe("text — click-delegate ancestor: click only, check/uncheck unsupported");
    });

    it("H2c — click_delegate combines with the sibling_text parenthetical rather than replacing it", () => {
      const comment = deriveLocatorHelperComment(
        el("e1", {
          tag: "input",
          locator: {
            strategy: "sibling_text",
            confidence: "high",
            value: "GAY EVENT",
            xpath: '//input[preceding-sibling::*[normalize-space()="GAY EVENT"]]',
            click_delegate: true
          }
        })
      );
      expect(comment).toBe(
        'sibling_text (no accessible name — matched via sibling text: "GAY EVENT")' +
          " — click-delegate ancestor: click only, check/uncheck unsupported"
      );
    });

    it("H3 — dynamic element renders as dyn_param, not sibling_text's parenthetical form", () => {
      expect(
        deriveLocatorHelperComment(
          el("e1", {
            tag: "button",
            testid: "delete-{id}",
            testid_attr: "data-testid",
            dynamic: [{ name: "id", type: "string" }]
          })
        )
      ).toBe("dyn_param");
    });
  });

  describe("dynamic locators", () => {
    it("DL1 — dynamic testid emits a template-literal getByTestId with ${param}", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "button",
          testid: "delete-product-{id}",
          testid_attr: "data-testid",
          dynamic: [{ name: "id", type: "string" }]
        })
      );
      expect(locator).toBe("this.page.getByTestId(`delete-product-${id}`)");
    });

    it("DL2 — dynamic name emits a template-literal getByText", () => {
      const locator = deriveLocator(
        el("e1", { tag: "span", name: "row-{label}", dynamic: [{ name: "label", type: "string" }] })
      );
      expect(locator).toBe("this.page.getByText(`row-${label}`, { exact: true })");
    });

    it("DL3 — dynamic role+name emits getByRole with template-literal name", () => {
      const locator = deriveLocator(
        el("e1", {
          tag: "button",
          role: "button",
          name: "Day {day}",
          dynamic: [{ name: "day", type: "string" }]
        })
      );
      expect(locator).toBe("this.page.getByRole('button', { name: `Day ${day}`, exact: true })");
    });

    it("DL4 — empty dynamic array is treated as static (single quotes)", () => {
      const locator = deriveLocator(
        el("e1", { tag: "input", testid: "email", testid_attr: "data-testid", dynamic: [] })
      );
      expect(locator).toBe(`this.page.getByTestId('email')`);
    });

    it("DL5 — field name strips {placeholders}", () => {
      expect(
        deriveFieldName(
          el("e1", {
            tag: "button",
            testid: "delete-product-{id}",
            dynamic: [{ name: "id", type: "string" }]
          })
        )
      ).toBe("deleteProductButton");
    });
  });

  describe("deriveFieldName", () => {
    it("F1 — testid drives field name with tag suffix", () => {
      expect(deriveFieldName(el("e1", { tag: "button", testid: "submit" }))).toBe("submitButton");
    });

    it("F2 — name drives field name when testid absent", () => {
      expect(deriveFieldName(el("e1", { tag: "input", name: "user-email" }))).toBe(
        "userEmailInput"
      );
    });

    it("F3 — role drives field name when testid and name absent", () => {
      expect(deriveFieldName(el("e1", { tag: "button", role: "submit" }))).toBe("submitButton");
    });

    it("F4 — tag alone drives field name when no other identifiers", () => {
      expect(deriveFieldName(el("e1", { tag: "div" }))).toBe("divDiv");
    });

    it("F5 — hyphens underscores and spaces become camelCase", () => {
      expect(deriveFieldName(el("e1", { tag: "input", testid: "user_email field" }))).toBe(
        "userEmailFieldInput"
      );
    });

    it("F6 — unknown tag suffix defaults to Element", () => {
      expect(deriveFieldName(el("e1", { tag: "section", testid: "panel" }))).toBe("panelElement");
    });

    it("F7 — camelCase ref used for live-region role when testid and name absent", () => {
      expect(deriveFieldName(el("errorMessage", { tag: "div", role: "alert" }))).toBe(
        "errorMessage"
      );
    });

    it("F8 — generic ref e1 still uses role when testid and name absent", () => {
      expect(deriveFieldName(el("e1", { tag: "button", role: "submit" }))).toBe("submitButton");
    });

    it("F9 — semantic ref used before role when testid and name absent", () => {
      expect(deriveFieldName(el("submitBtn", { tag: "button", role: "button" }))).toBe("submitBtn");
    });
  });

  describe("deduplicateFieldNames", () => {
    it("D1 — second collision gets numeric suffix", () => {
      const map = deduplicateFieldNames([
        el("r1", { tag: "button", testid: "submit" }),
        el("r2", { tag: "button", testid: "submit" })
      ]);
      expect(map.get("r1")).toBe("submitButton");
      expect(map.get("r2")).toBe("submitButton2");
    });

    it("D2 — three collisions get submitButton, submitButton2, submitButton3", () => {
      const map = deduplicateFieldNames([
        el("r1", { tag: "button", testid: "submit" }),
        el("r2", { tag: "button", testid: "submit" }),
        el("r3", { tag: "button", testid: "submit" })
      ]);
      expect(map.get("r1")).toBe("submitButton");
      expect(map.get("r2")).toBe("submitButton2");
      expect(map.get("r3")).toBe("submitButton3");
    });

    it("D3 — distinct field names receive no suffix", () => {
      const map = deduplicateFieldNames([
        el("r1", { tag: "button", testid: "save" }),
        el("r2", { tag: "button", testid: "cancel" })
      ]);
      expect(map.get("r1")).toBe("saveButton");
      expect(map.get("r2")).toBe("cancelButton");
    });

    it("D4 — map has one entry per element ref", () => {
      const elements = [
        el("r1", { tag: "button", testid: "a" }),
        el("r2", { tag: "button", testid: "b" })
      ];
      const map = deduplicateFieldNames(elements);
      expect(map.size).toBe(2);
      expect([...map.keys()].sort()).toEqual(["r1", "r2"]);
    });
  });
});
